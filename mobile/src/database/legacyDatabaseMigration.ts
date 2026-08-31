import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { LEGACY_DATABASE_NAME } from './constants';

async function hasApplicationSchema(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM sqlite_master
     WHERE type = 'table' AND name IN ('transactions', 'categories', 'sync_outbox')`,
  );
  return (row?.count ?? 0) > 0;
}

export async function migrateLegacyDatabaseIfNeeded(
  encryptedDb: SQLiteDatabase,
): Promise<boolean> {
  if (await hasApplicationSchema(encryptedDb)) {
    return false;
  }

  const legacyDb = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
  let migrated = false;
  try {
    if (!(await hasApplicationSchema(legacyDb))) {
      return false;
    }

    await legacyDb.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    await SQLite.backupDatabaseAsync({
      sourceDatabase: legacyDb,
      sourceDatabaseName: 'main',
      destDatabase: encryptedDb,
      destDatabaseName: 'main',
    });
    migrated = true;
    return true;
  } finally {
    await legacyDb.closeAsync();
    if (migrated) {
      await SQLite.deleteDatabaseAsync(LEGACY_DATABASE_NAME);
    }
  }
}
