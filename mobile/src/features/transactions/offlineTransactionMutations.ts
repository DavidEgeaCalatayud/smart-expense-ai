import type { TransactionUpsertMutation } from '@smart-expense-ai/api-contracts';
import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../../database/keyedTransaction';
import type { LocalTransactionRow } from '../../database/types';
import { assertEntityNotSending, enqueueMutation, type OutboxRow } from '../../sync/outboxRepository';
import { validateOfflineTransactionInput, type OfflineTransactionFormInput } from './validation';
import { resolveTransactionCategory } from './createOfflineTransaction';

interface EditableTransactionRow extends LocalTransactionRow {
  category_name: string;
}

export type OfflineTransactionEditInput = Omit<OfflineTransactionFormInput, 'categoryName'> & { categoryName?: string };

async function getEditableTransaction(
  db: SQLiteDatabase,
  transactionId: string,
): Promise<EditableTransactionRow> {
  const row = await db.getFirstAsync<EditableTransactionRow>(
    `SELECT t.*, c.name AS category_name
     FROM transactions t
     INNER JOIN categories c ON c.id = t.category_id
     WHERE t.id = ?
     LIMIT 1`,
    transactionId,
  );
  if (!row) {
    throw new Error('Transaction is no longer available on this device');
  }
  return row;
}

export async function updateOfflineTransaction(
  db: SQLiteDatabase,
  transactionId: string,
  input: OfflineTransactionEditInput,
): Promise<void> {
  await runKeyedTransaction(db, async (txn) => {
    await assertEntityNotSending(txn, 'transaction', transactionId);
    const current = await getEditableTransaction(txn, transactionId);
    if (current.sync_status === 'conflict') {
      throw new Error('Resolve this transaction conflict before editing it again');
    }

    const validated = validateOfflineTransactionInput({
      merchant: input.merchant,
      amount: input.amount,
      categoryName: input.categoryName ?? current.category_name,
      categoryId: input.categoryId ?? (input.categoryName ? undefined : current.category_id),
      transactionType: input.transactionType ?? current.transaction_type,
      paymentMethod: input.paymentMethod ?? current.payment_method,
      description: input.description ?? current.description,
      isRecurring: input.isRecurring ?? current.is_recurring === 1,
      transactionDate: input.transactionDate,
    });
    const now = new Date().toISOString();
    const categoryId = await resolveTransactionCategory(txn, validated, now, current.category_id);
    const payload = {
      merchant: validated.merchant, description: validated.description, categoryId,
      amount: minorUnitsToDecimal(validated.amountMinor), currency: current.currency,
      transactionDate: validated.transactionDate, transactionType: validated.transactionType,
      paymentMethod: validated.paymentMethod, isRecurring: validated.isRecurring, source: current.source,
    };

    const existingMutation = await txn.getFirstAsync<OutboxRow>(
      `SELECT * FROM sync_outbox
       WHERE entity_type = 'transaction' AND entity_id = ?
         AND status IN ('queued', 'failed')
       ORDER BY sequence DESC
       LIMIT 1`,
      transactionId,
    );

    await txn.runAsync(
      `UPDATE transactions
       SET merchant = ?, amount_minor = ?, transaction_date = ?,
           description = ?, category_id = ?, transaction_type = ?, payment_method = ?, is_recurring = ?,
           sync_status = 'pending', updated_at = ?
       WHERE id = ?`,
      validated.merchant,
      validated.amountMinor,
      validated.transactionDate,
      validated.description, categoryId, validated.transactionType, validated.paymentMethod,
      validated.isRecurring ? 1 : 0,
      now,
      transactionId,
    );

    if (existingMutation && existingMutation.operation === 'upsert') {
      await txn.runAsync(
        `UPDATE sync_outbox
         SET payload_json = ?, status = 'queued', last_error = NULL,
             client_occurred_at = ?, updated_at = ?
         WHERE mutation_id = ?`,
        JSON.stringify(payload),
        now,
        now,
        existingMutation.mutation_id,
      );
      return;
    }

    const mutation: TransactionUpsertMutation = {
      mutationId: Crypto.randomUUID(),
      entityId: transactionId,
      entityType: 'transaction',
      operation: 'upsert',
      baseVersion: current.server_version,
      clientOccurredAt: now,
      payload,
    };
    await enqueueMutation(txn, mutation, now);
  });
}

export async function deleteOfflineTransaction(
  db: SQLiteDatabase,
  transactionId: string,
): Promise<void> {
  await runKeyedTransaction(db, async (txn) => {
    await assertEntityNotSending(txn, 'transaction', transactionId);
    const current = await getEditableTransaction(txn, transactionId);
    if (current.sync_status === 'conflict') {
      throw new Error('Resolve this transaction conflict before deleting it');
    }
    const now = new Date().toISOString();

    const existingMutation = await txn.getFirstAsync<OutboxRow>(
      `SELECT * FROM sync_outbox
       WHERE entity_type = 'transaction' AND entity_id = ?
         AND status IN ('queued', 'failed')
       ORDER BY sequence DESC
       LIMIT 1`,
      transactionId,
    );

    if (current.server_version === null) {
      await txn.runAsync(
        "DELETE FROM sync_outbox WHERE entity_type = 'transaction' AND entity_id = ?",
        transactionId,
      );
      await txn.runAsync('DELETE FROM transactions WHERE id = ?', transactionId);
      return;
    }

    const baseVersion = existingMutation?.base_version ?? current.server_version;
    await txn.runAsync(
      "DELETE FROM sync_outbox WHERE entity_type = 'transaction' AND entity_id = ?",
      transactionId,
    );
    await txn.runAsync('DELETE FROM transactions WHERE id = ?', transactionId);
    await enqueueMutation(
      txn,
      {
        mutationId: Crypto.randomUUID(),
        entityId: transactionId,
        entityType: 'transaction',
        operation: 'delete',
        baseVersion,
        clientOccurredAt: now,
      },
      now,
    );
  });
}
