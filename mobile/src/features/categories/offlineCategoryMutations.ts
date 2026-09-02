import type { CategoryUpsertMutation } from '@smart-expense-ai/api-contracts';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../../database/keyedTransaction';
import type { LocalCategoryRow } from '../../database/types';
import { enqueueMutation, type OutboxRow } from '../../sync/outboxRepository';
import { normalizeCategoryName, normalizedCategoryKey } from './validation';

export type CategoryTransactionType = 'expense' | 'income';

async function findCategory(db: SQLiteDatabase, categoryId: string): Promise<LocalCategoryRow> {
  const category = await db.getFirstAsync<LocalCategoryRow>(
    'SELECT * FROM categories WHERE id = ? LIMIT 1',
    categoryId,
  );
  if (!category) {
    throw new Error('Category is no longer available on this device');
  }
  return category;
}

async function assertNameAvailable(
  db: SQLiteDatabase,
  name: string,
  type: CategoryTransactionType,
  excludeId: string | null,
): Promise<void> {
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM categories
     WHERE normalized_name = ? AND transaction_type = ?
       AND (? IS NULL OR id != ?)
     LIMIT 1`,
    normalizedCategoryKey(name),
    type,
    excludeId,
    excludeId,
  );
  if (existing) {
    throw new Error(`A visible ${type} category named ${name} already exists`);
  }
}

function payload(category: LocalCategoryRow, name = category.name, archived = category.archived === 1) {
  return {
    name,
    transactionType: category.transaction_type,
    systemCategory: false,
    archived,
  } as const;
}

async function queueCategoryUpsert(
  db: SQLiteDatabase,
  category: LocalCategoryRow,
  nextPayload: ReturnType<typeof payload>,
  now: string,
): Promise<void> {
  const existingMutation = await db.getFirstAsync<OutboxRow>(
    `SELECT * FROM sync_outbox
     WHERE entity_type = 'category' AND entity_id = ?
       AND status IN ('queued', 'failed')
     ORDER BY sequence DESC
     LIMIT 1`,
    category.id,
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

  const mutation: CategoryUpsertMutation = {
    mutationId: Crypto.randomUUID(),
    entityId: category.id,
    entityType: 'category',
    operation: 'upsert',
    baseVersion: category.server_version,
    clientOccurredAt: now,
    payload: nextPayload,
  };
  await enqueueMutation(db, mutation, now);
}

export async function createOfflineCategory(
  db: SQLiteDatabase,
  input: { name: string; transactionType: CategoryTransactionType },
): Promise<string> {
  const name = normalizeCategoryName(input.name);
  await assertNameAvailable(db, name, input.transactionType, null);
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const category: LocalCategoryRow = {
    id,
    name,
    normalized_name: normalizedCategoryKey(name),
    transaction_type: input.transactionType,
    system_category: 0,
    archived: 0,
    server_version: null,
    sync_status: 'pending',
    created_at: now,
    updated_at: now,
  };

  await runKeyedTransaction(db, async (txn) => {
    await txn.runAsync(
      `INSERT INTO categories (
         id, name, normalized_name, transaction_type, system_category, archived,
         server_version, sync_status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 0, 0, NULL, 'pending', ?, ?)`,
      id,
      name,
      normalizedCategoryKey(name),
      input.transactionType,
      now,
      now,
    );
    await queueCategoryUpsert(txn, category, payload(category), now);
  });
  return id;
}

export async function renameOfflineCategory(
  db: SQLiteDatabase,
  categoryId: string,
  nextNameInput: string,
): Promise<void> {
  const category = await findCategory(db, categoryId);
  if (category.system_category === 1) {
    throw new Error('System categories are read-only');
  }
  if (category.sync_status === 'conflict') {
    throw new Error('Resolve this category conflict before editing it again');
  }
  const nextName = normalizeCategoryName(nextNameInput);
  await assertNameAvailable(db, nextName, category.transaction_type, category.id);
  const now = new Date().toISOString();

  await runKeyedTransaction(db, async (txn) => {
    await txn.runAsync(
      `UPDATE categories
       SET name = ?, normalized_name = ?, sync_status = 'pending', updated_at = ?
       WHERE id = ?`,
      nextName,
      normalizedCategoryKey(nextName),
      now,
      category.id,
    );
    await queueCategoryUpsert(txn, category, payload(category, nextName), now);
  });
}

export async function setOfflineCategoryArchived(
  db: SQLiteDatabase,
  categoryId: string,
  archived: boolean,
): Promise<void> {
  const category = await findCategory(db, categoryId);
  if (category.system_category === 1) {
    throw new Error('System categories are read-only');
  }
  if (category.sync_status === 'conflict') {
    throw new Error('Resolve this category conflict before changing its lifecycle');
  }
  if ((category.archived === 1) === archived) {
    return;
  }

  if (archived) {
    const usage = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM transactions WHERE category_id = ?',
      category.id,
    );
    if ((usage?.count ?? 0) > 0) {
      throw new Error('Reassign transactions before archiving this category');
    }
  } else {
    await assertNameAvailable(db, category.name, category.transaction_type, category.id);
  }

  const now = new Date().toISOString();
  await runKeyedTransaction(db, async (txn) => {
    await txn.runAsync(
      `UPDATE categories
       SET archived = ?, sync_status = 'pending', updated_at = ?
       WHERE id = ?`,
      archived ? 1 : 0,
      now,
      category.id,
    );
    await queueCategoryUpsert(txn, category, payload(category, category.name, archived), now);
  });
}
