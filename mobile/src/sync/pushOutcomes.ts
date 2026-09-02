import type {
  SyncConflict,
  SyncMutation,
  SyncPushResponse,
} from '@smart-expense-ai/api-contracts';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../database/keyedTransaction';
import { storeConflict } from './conflictRepository';
import { type OutboxRow, outboxRowToMutation } from './outboxRepository';

const TABLE_BY_ENTITY = {
  transaction: 'transactions',
  category: 'categories',
  budget: 'budgets',
} as const;

function conflictByMutationId(response: SyncPushResponse): Map<string, SyncConflict> {
  return new Map(response.conflicts.map((conflict) => [conflict.mutationId, conflict]));
}

async function updateEntityStatus(
  db: SQLiteDatabase,
  mutation: SyncMutation,
  status: 'synced' | 'failed' | 'conflict',
  serverVersion?: number | null,
): Promise<void> {
  const table = TABLE_BY_ENTITY[mutation.entityType];
  const now = new Date().toISOString();
  if (serverVersion === undefined) {
    await db.runAsync(
      `UPDATE ${table} SET sync_status = ?, updated_at = ? WHERE id = ?`,
      status,
      now,
      mutation.entityId,
    );
    return;
  }
  await db.runAsync(
    `UPDATE ${table}
     SET sync_status = ?, server_version = ?, updated_at = ?
     WHERE id = ?`,
    status,
    serverVersion,
    now,
    mutation.entityId,
  );
}

export async function persistPushResponse(
  db: SQLiteDatabase,
  rows: readonly OutboxRow[],
  response: SyncPushResponse,
): Promise<void> {
  const rowByMutationId = new Map(rows.map((row) => [row.mutation_id, row]));
  const conflicts = conflictByMutationId(response);

  await runKeyedTransaction(db, async (txn) => {
    for (const result of response.results) {
      const row = rowByMutationId.get(result.mutationId);
      if (!row) {
        continue;
      }
      const mutation = outboxRowToMutation(row);

      if (result.status === 'applied' || result.status === 'duplicate') {
        if (mutation.operation === 'delete') {
          await txn.runAsync(`DELETE FROM ${TABLE_BY_ENTITY[mutation.entityType]} WHERE id = ?`, mutation.entityId);
        } else {
          await updateEntityStatus(txn, mutation, 'synced', result.serverVersion ?? null);
        }
        await txn.runAsync('DELETE FROM sync_outbox WHERE mutation_id = ?', mutation.mutationId);
        continue;
      }

      if (result.status === 'conflict') {
        const conflict = conflicts.get(result.mutationId);
        if (!conflict) {
          throw new Error(`Sync conflict ${result.mutationId} is missing server conflict evidence`);
        }
        await storeConflict(txn, conflict, mutation);
        await updateEntityStatus(txn, mutation, 'conflict', result.serverVersion ?? null);
        await txn.runAsync('DELETE FROM sync_outbox WHERE mutation_id = ?', mutation.mutationId);
        continue;
      }

      const message = result.error?.message ?? 'The server rejected this mutation.';
      await txn.runAsync(
        `UPDATE sync_outbox
         SET status = 'failed', last_error = ?, updated_at = ?
         WHERE mutation_id = ?`,
        message.slice(0, 500),
        new Date().toISOString(),
        mutation.mutationId,
      );
      await updateEntityStatus(txn, mutation, 'failed');
    }
  });
}
