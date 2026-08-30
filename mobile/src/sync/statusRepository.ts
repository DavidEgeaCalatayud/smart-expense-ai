import type { SQLiteDatabase } from 'expo-sqlite';

export interface SyncHealth {
  queued: number;
  sending: number;
  failed: number;
  conflicts: number;
}

interface CountRow {
  count: number;
}

async function count(
  db: SQLiteDatabase,
  sql: string,
  ...params: (string | number | null)[]
): Promise<number> {
  const row = await db.getFirstAsync<CountRow>(sql, ...params);
  return row?.count ?? 0;
}

export async function getSyncHealth(db: SQLiteDatabase): Promise<SyncHealth> {
  const [queued, sending, failed, conflicts] = await Promise.all([
    count(db, "SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'queued'"),
    count(db, "SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'sending'"),
    count(db, "SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'failed'"),
    count(db, 'SELECT COUNT(*) AS count FROM sync_conflicts WHERE resolved_at IS NULL'),
  ]);
  return { queued, sending, failed, conflicts };
}
