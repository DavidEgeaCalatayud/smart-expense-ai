import type { SQLiteDatabase } from 'expo-sqlite';

import {
  applyAndVerifyDatabaseEncryption,
  migrateLegacyPlaintextDatabase,
  verifyDatabaseEncryption,
} from './databaseEncryption';
import { migrateDatabase } from './migrations';

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  // Fail closed: no schema query or migration is allowed before SQLCipher is keyed and verified.
  await applyAndVerifyDatabaseEncryption(db);
  await migrateLegacyPlaintextDatabase(db);
  await migrateDatabase(db);
  await db.execAsync('PRAGMA foreign_keys = ON');
  await verifyDatabaseEncryption(db);
}
