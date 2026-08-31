import type { SQLiteDatabase } from 'expo-sqlite';

export interface CachedServerValue<T> {
  value: T;
  fetchedAt: string;
}

interface ServerCacheRow {
  payload_json: string;
  fetched_at: string;
}

export async function readServerCache<T>(
  db: SQLiteDatabase,
  cacheKey: string,
): Promise<CachedServerValue<T> | null> {
  const row = await db.getFirstAsync<ServerCacheRow>(
    'SELECT payload_json, fetched_at FROM server_cache WHERE cache_key = ? LIMIT 1',
    cacheKey,
  );
  if (!row) return null;

  try {
    return { value: JSON.parse(row.payload_json) as T, fetchedAt: row.fetched_at };
  } catch {
    await db.runAsync('DELETE FROM server_cache WHERE cache_key = ?', cacheKey);
    return null;
  }
}

export async function writeServerCache<T>(
  db: SQLiteDatabase,
  cacheKey: string,
  value: T,
  fetchedAt = new Date().toISOString(),
): Promise<void> {
  await db.runAsync(
    `INSERT INTO server_cache (cache_key, payload_json, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET
       payload_json = excluded.payload_json,
       fetched_at = excluded.fetched_at`,
    cacheKey,
    JSON.stringify(value),
    fetchedAt,
  );
}
