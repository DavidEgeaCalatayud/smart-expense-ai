import type { SQLiteDatabase } from 'expo-sqlite';

import { getOrCreateDatabaseKey } from './databaseKey';
import { migrateLegacyDatabaseIfNeeded } from './legacyDatabaseMigration';
import { migrateDatabase } from './migrations';

async function assertSqlCipherReady(db: SQLiteDatabase): Promise<void> {
  const version = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  if (!version?.cipher_version) {
    throw new Error('SQLCipher is required but is not available in this native build');
  }

  // Force the first page read immediately after keying. A missing/wrong key must
  // fail before legacy migration or any application query can touch the database.
  await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sqlite_master');
}

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  const databaseKey = await getOrCreateDatabaseKey();
  await db.execAsync(`PRAGMA key = "x'${databaseKey}'"`);
  await assertSqlCipherReady(db);
  await db.execAsync('PRAGMA secure_delete = ON');
  await migrateLegacyDatabaseIfNeeded(db);
  await migrateDatabase(db);
  await db.execAsync('PRAGMA foreign_keys = ON');
}
