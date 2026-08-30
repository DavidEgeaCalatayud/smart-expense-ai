import type { SyncConflict, SyncMutation } from '@smart-expense-ai/api-contracts';
import type { SQLiteDatabase } from 'expo-sqlite';

export interface StoredConflict {
  mutationId: string;
  entityType: SyncConflict['entityType'];
  entityId: string;
  reason: SyncConflict['reason'];
  serverVersion: number | null;
  serverPayloadJson: string | null;
  localPayloadJson: string | null;
  createdAt: string;
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
