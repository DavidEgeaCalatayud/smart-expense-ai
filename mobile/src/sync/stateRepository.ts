import type { SQLiteDatabase } from 'expo-sqlite';

export async function getSyncState(
  db: SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_state WHERE key = ? LIMIT 1',
    key,
  );
  return row?.value ?? null;
}

export async function setSyncState(
  db: SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_state (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    now,
  );
}
