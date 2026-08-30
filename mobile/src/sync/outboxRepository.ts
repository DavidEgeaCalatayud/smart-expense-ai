import type {
  BudgetSyncPayload,
  CategorySyncPayload,
  SyncMutation,
  TransactionSyncPayload,
} from '@smart-expense-ai/api-contracts';
import type { SQLiteDatabase } from 'expo-sqlite';

export interface OutboxRow {
  sequence: number;
  mutation_id: string;
  entity_type: SyncMutation['entityType'];
  entity_id: string;
  operation: SyncMutation['operation'];
  base_version: number | null;
  payload_json: string | null;
  client_occurred_at: string;
  status: 'queued' | 'sending' | 'failed';
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

type SqlWriter = Pick<SQLiteDatabase, 'runAsync'>;

export async function enqueueMutation(
  db: SqlWriter,
  mutation: SyncMutation,
  now: string,
): Promise<void> {
  const payloadJson = mutation.operation === 'upsert' ? JSON.stringify(mutation.payload) : null;

  await db.runAsync(
    `INSERT INTO sync_outbox (
       mutation_id, entity_type, entity_id, operation, base_version,
       payload_json, client_occurred_at, status, attempt_count,
       last_error, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, NULL, ?, ?)`,
    mutation.mutationId,
    mutation.entityType,
    mutation.entityId,
    mutation.operation,
    mutation.baseVersion,
    payloadJson,
    mutation.clientOccurredAt,
    now,
    now,
  );
}

export function listPendingMutations(
  db: SQLiteDatabase,
  limit = 50,
): Promise<OutboxRow[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Outbox limit must be an integer between 1 and 100');
  }

  return db.getAllAsync<OutboxRow>(
    `SELECT * FROM sync_outbox
     WHERE status = 'queued'
     ORDER BY sequence ASC
     LIMIT ?`,
    limit,
  );
}

export function getOutboxMutation(
  db: SQLiteDatabase,
  mutationId: string,
): Promise<OutboxRow | null> {
  return db.getFirstAsync<OutboxRow>(
    'SELECT * FROM sync_outbox WHERE mutation_id = ? LIMIT 1',
    mutationId,
  );
}

export async function resetInterruptedMutations(db: SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'queued', last_error = NULL, updated_at = ?
     WHERE status = 'sending'`,
    now,
  );
}

export async function markMutationsSending(
  db: SQLiteDatabase,
  mutationIds: readonly string[],
): Promise<void> {
  if (mutationIds.length === 0) {
    return;
  }
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const mutationId of mutationIds) {
      await txn.runAsync(
        `UPDATE sync_outbox
         SET status = 'sending', attempt_count = attempt_count + 1,
             last_error = NULL, updated_at = ?
         WHERE mutation_id = ?`,
        now,
        mutationId,
      );
    }
  });
}

export async function requeueMutations(
  db: SQLiteDatabase,
  mutationIds: readonly string[],
  error: string,
): Promise<void> {
  if (mutationIds.length === 0) {
    return;
  }
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const mutationId of mutationIds) {
      await txn.runAsync(
        `UPDATE sync_outbox
         SET status = 'queued', last_error = ?, updated_at = ?
         WHERE mutation_id = ?`,
        error.slice(0, 500),
        now,
        mutationId,
      );
    }
  });
}

export async function markMutationFailed(
  db: SqlWriter,
  mutationId: string,
  error: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'failed', last_error = ?, updated_at = ?
     WHERE mutation_id = ?`,
    error.slice(0, 500),
    new Date().toISOString(),
    mutationId,
  );
}

export async function removeMutation(db: SqlWriter, mutationId: string): Promise<void> {
  await db.runAsync('DELETE FROM sync_outbox WHERE mutation_id = ?', mutationId);
}

export function outboxRowToMutation(row: OutboxRow): SyncMutation {
  const metadata = {
    mutationId: row.mutation_id,
    entityId: row.entity_id,
    baseVersion: row.base_version,
    clientOccurredAt: row.client_occurred_at,
  };

  if (row.operation === 'delete') {
    return {
      ...metadata,
      entityType: row.entity_type,
      operation: 'delete',
    };
  }

  if (!row.payload_json) {
    throw new Error(`Outbox mutation ${row.mutation_id} is missing its upsert payload`);
  }
  const payload = JSON.parse(row.payload_json) as unknown;

  switch (row.entity_type) {
    case 'transaction':
      return {
        ...metadata,
        entityType: 'transaction',
        operation: 'upsert',
        payload: payload as TransactionSyncPayload,
      };
    case 'category':
      return {
        ...metadata,
        entityType: 'category',
        operation: 'upsert',
        payload: payload as CategorySyncPayload,
      };
    case 'budget':
      return {
        ...metadata,
        entityType: 'budget',
        operation: 'upsert',
        payload: payload as BudgetSyncPayload,
      };
  }
}
