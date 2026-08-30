import type { SyncConflict, SyncMutation } from '@smart-expense-ai/api-contracts';
import type { SQLiteDatabase } from 'expo-sqlite';

export interface StoredConflictRow {
  id: number;
  mutation_id: string;
  entity_type: SyncConflict['entityType'];
  entity_id: string;
  reason: SyncConflict['reason'];
  server_version: number | null;
  server_payload_json: string | null;
  local_payload_json: string | null;
  created_at: string;
  resolved_at: string | null;
}

export async function storeConflict(
  db: SQLiteDatabase,
  conflict: SyncConflict,
  localMutation: SyncMutation,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_conflicts (
       mutation_id, entity_type, entity_id, reason, server_version,
       server_payload_json, local_payload_json, created_at, resolved_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(mutation_id) DO UPDATE SET
       reason = excluded.reason,
       server_version = excluded.server_version,
       server_payload_json = excluded.server_payload_json,
       local_payload_json = excluded.local_payload_json,
       created_at = excluded.created_at,
       resolved_at = NULL`,
    conflict.mutationId,
    conflict.entityType,
    conflict.entityId,
    conflict.reason,
    conflict.serverVersion,
    conflict.serverPayload === null ? null : JSON.stringify(conflict.serverPayload),
    localMutation.operation === 'upsert' ? JSON.stringify(localMutation.payload) : null,
    now,
  );
}

export function listUnresolvedConflicts(db: SQLiteDatabase): Promise<StoredConflictRow[]> {
  return db.getAllAsync<StoredConflictRow>(
    `SELECT * FROM sync_conflicts
     WHERE resolved_at IS NULL
     ORDER BY created_at DESC, id DESC`,
  );
}

export function getUnresolvedConflict(
  db: SQLiteDatabase,
  conflictId: number,
): Promise<StoredConflictRow | null> {
  return db.getFirstAsync<StoredConflictRow>(
    `SELECT * FROM sync_conflicts
     WHERE id = ? AND resolved_at IS NULL
     LIMIT 1`,
    conflictId,
  );
}

export async function markConflictResolved(
  db: SQLiteDatabase,
  conflictId: number,
): Promise<void> {
  await db.runAsync(
    'UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?',
    new Date().toISOString(),
    conflictId,
  );
}
