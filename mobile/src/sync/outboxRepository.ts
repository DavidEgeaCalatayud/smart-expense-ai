import type { SyncMutation } from '@smart-expense-ai/api-contracts';
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
     WHERE status IN ('queued', 'failed')
     ORDER BY sequence ASC
     LIMIT ?`,
    limit,
  );
}
