import type { TransactionUpsertMutation } from '@smart-expense-ai/api-contracts';
import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../../database/keyedTransaction';
import type { LocalTransactionRow } from '../../database/types';
import { enqueueMutation, type OutboxRow } from '../../sync/outboxRepository';
import { validateOfflineTransactionInput } from './validation';

interface EditableTransactionRow extends LocalTransactionRow {
  category_name: string;
}

export interface OfflineTransactionEditInput {
  merchant: string;
  amount: string;
  transactionDate: string;
}

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

function payloadFor(row: EditableTransactionRow, merchant: string, amountMinor: number, date: string) {
  return {
    merchant,
    description: row.description,
    categoryId: row.category_id,
    amount: minorUnitsToDecimal(amountMinor),
    currency: row.currency,
    transactionDate: date,
    transactionType: row.transaction_type,
    paymentMethod: row.payment_method,
    isRecurring: row.is_recurring === 1,
    source: row.source,
  } as const;
}

export async function updateOfflineTransaction(
  db: SQLiteDatabase,
  transactionId: string,
  input: OfflineTransactionEditInput,
): Promise<void> {
  const current = await getEditableTransaction(db, transactionId);
  if (current.sync_status === 'conflict') {
    throw new Error('Resolve this transaction conflict before editing it again');
  }

  const validated = validateOfflineTransactionInput({
    merchant: input.merchant,
    amount: input.amount,
    categoryName: current.category_name,
    transactionDate: input.transactionDate,
  });
  const now = new Date().toISOString();
  const payload = payloadFor(current, validated.merchant, validated.amountMinor, validated.transactionDate);

  await runKeyedTransaction(db, async (txn) => {
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
           sync_status = 'pending', updated_at = ?
       WHERE id = ?`,
      validated.merchant,
      validated.amountMinor,
      validated.transactionDate,
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
  const current = await getEditableTransaction(db, transactionId);
  if (current.sync_status === 'conflict') {
    throw new Error('Resolve this transaction conflict before deleting it');
  }
  const now = new Date().toISOString();

  await runKeyedTransaction(db, async (txn) => {
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
