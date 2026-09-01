import type { BudgetUpsertMutation } from '@smart-expense-ai/api-contracts';
import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../../database/keyedTransaction';
import type { LocalBudgetRow, LocalCategoryRow } from '../../database/types';
import { enqueueMutation, type OutboxRow } from '../../sync/outboxRepository';
import {
  budgetMonthForSync,
  validateBudgetLimitAmount,
  validateBudgetMonth,
} from './validation';

export interface OfflineBudgetInput {
  month: string;
  categoryId: string | null;
  limitAmount: string;
}

async function validateCategory(
  db: SQLiteDatabase,
  categoryId: string | null,
): Promise<LocalCategoryRow | null> {
  if (categoryId === null) {
    return null;
  }
  const category = await db.getFirstAsync<LocalCategoryRow>(
    'SELECT * FROM categories WHERE id = ? LIMIT 1',
    categoryId,
  );
  if (!category || category.archived === 1) {
    throw new Error('Budget category is not available');
  }
  if (category.transaction_type !== 'expense') {
    throw new Error('Budgets can only target expense categories');
  }
  return category;
}

async function findBudget(db: SQLiteDatabase, budgetId: string): Promise<LocalBudgetRow> {
  const budget = await db.getFirstAsync<LocalBudgetRow>(
    'SELECT * FROM budgets WHERE id = ? LIMIT 1',
    budgetId,
  );
  if (!budget) {
    throw new Error('Budget is no longer available on this device');
  }
  return budget;
}

function payload(month: string, categoryId: string | null, limitMinor: number) {
  return {
    categoryId,
    month: budgetMonthForSync(month),
    limitAmount: minorUnitsToDecimal(limitMinor),
  } as const;
}

async function queueBudgetUpsert(
  db: SQLiteDatabase,
  budget: LocalBudgetRow,
  nextPayload: ReturnType<typeof payload>,
  now: string,
): Promise<void> {
  const existingMutation = await db.getFirstAsync<OutboxRow>(
    `SELECT * FROM sync_outbox
     WHERE entity_type = 'budget' AND entity_id = ?
       AND status IN ('queued', 'failed')
     ORDER BY sequence DESC
     LIMIT 1`,
    budget.id,
  );

  if (existingMutation && existingMutation.operation === 'upsert') {
    await db.runAsync(
      `UPDATE sync_outbox
       SET payload_json = ?, status = 'queued', last_error = NULL,
           client_occurred_at = ?, updated_at = ?
       WHERE mutation_id = ?`,
      JSON.stringify(nextPayload),
      now,
      now,
      existingMutation.mutation_id,
    );
    return;
  }

  const mutation: BudgetUpsertMutation = {
    mutationId: Crypto.randomUUID(),
    entityId: budget.id,
    entityType: 'budget',
    operation: 'upsert',
    baseVersion: budget.server_version,
    clientOccurredAt: now,
    payload: nextPayload,
  };
  await enqueueMutation(db, mutation, now);
}

export async function createOfflineBudget(
  db: SQLiteDatabase,
  input: OfflineBudgetInput,
): Promise<string> {
  const month = validateBudgetMonth(input.month);
  const limitMinor = validateBudgetLimitAmount(input.limitAmount);
  await validateCategory(db, input.categoryId);

  const duplicate = input.categoryId === null
    ? await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM budgets WHERE month = ? AND category_id IS NULL LIMIT 1',
        month,
      )
    : await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM budgets WHERE month = ? AND category_id = ? LIMIT 1',
        month,
        input.categoryId,
      );
  if (duplicate) {
    throw new Error('A budget already exists for this month and scope');
  }

  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const budget: LocalBudgetRow = {
    id,
    category_id: input.categoryId,
    month,
    limit_minor: limitMinor,
    server_version: null,
    sync_status: 'pending',
    created_at: now,
    updated_at: now,
  };

  await runKeyedTransaction(db, async (txn) => {
    await txn.runAsync(
      `INSERT INTO budgets (
         id, category_id, month, limit_minor, server_version,
         sync_status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, NULL, 'pending', ?, ?)`,
      id,
      input.categoryId,
      month,
      limitMinor,
      now,
      now,
    );
    await queueBudgetUpsert(txn, budget, payload(month, input.categoryId, limitMinor), now);
  });
  return id;
}

export async function updateOfflineBudget(
  db: SQLiteDatabase,
  budgetId: string,
  limitAmount: string,
): Promise<void> {
  const budget = await findBudget(db, budgetId);
  if (budget.sync_status === 'conflict') {
    throw new Error('Resolve this budget conflict before editing it again');
  }
  const limitMinor = validateBudgetLimitAmount(limitAmount);
  const now = new Date().toISOString();

  await runKeyedTransaction(db, async (txn) => {
    await txn.runAsync(
      `UPDATE budgets
       SET limit_minor = ?, sync_status = 'pending', updated_at = ?
       WHERE id = ?`,
      limitMinor,
      now,
      budget.id,
    );
    await queueBudgetUpsert(
      txn,
      budget,
      payload(budget.month, budget.category_id, limitMinor),
      now,
    );
  });
}

export async function deleteOfflineBudget(
  db: SQLiteDatabase,
  budgetId: string,
): Promise<void> {
  const budget = await findBudget(db, budgetId);
  if (budget.sync_status === 'conflict') {
    throw new Error('Resolve this budget conflict before deleting it');
  }
  const now = new Date().toISOString();

  await runKeyedTransaction(db, async (txn) => {
    const existingMutation = await txn.getFirstAsync<OutboxRow>(
      `SELECT * FROM sync_outbox
       WHERE entity_type = 'budget' AND entity_id = ?
         AND status IN ('queued', 'failed')
       ORDER BY sequence DESC
       LIMIT 1`,
      budget.id,
    );

    if (budget.server_version === null) {
      await txn.runAsync(
        "DELETE FROM sync_outbox WHERE entity_type = 'budget' AND entity_id = ?",
        budget.id,
      );
      await txn.runAsync('DELETE FROM budgets WHERE id = ?', budget.id);
      return;
    }

    const baseVersion = existingMutation?.base_version ?? budget.server_version;
    await txn.runAsync(
      "DELETE FROM sync_outbox WHERE entity_type = 'budget' AND entity_id = ?",
      budget.id,
    );
    await txn.runAsync('DELETE FROM budgets WHERE id = ?', budget.id);
    await enqueueMutation(
      txn,
      {
        mutationId: Crypto.randomUUID(),
        entityId: budget.id,
        entityType: 'budget',
        operation: 'delete',
        baseVersion,
        clientOccurredAt: now,
      },
      now,
    );
  });
}
