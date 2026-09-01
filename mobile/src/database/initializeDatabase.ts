import type { SQLiteDatabase } from 'expo-sqlite';

import {
  applyAndVerifyDatabaseEncryption,
  migrateLegacyPlaintextDatabase,
  verifyDatabaseEncryption,
} from './databaseEncryption';
import { migrateDatabase } from './migrations';

async function runInitializationStage(
  stage: string,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Database initialization failed during ${stage}: ${detail}`);
  }
}

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  // Fail closed: no schema query or migration is allowed before SQLCipher is keyed and verified.
  await runInitializationStage('SQLCipher key and first-page verification', () =>
    applyAndVerifyDatabaseEncryption(db),
  );
  await runInitializationStage('legacy plaintext migration', () =>
    migrateLegacyPlaintextDatabase(db),
  );
  await runInitializationStage('schema migration', () => migrateDatabase(db));
  await runInitializationStage('foreign-key activation', () => db.execAsync('PRAGMA foreign_keys = ON'));
  await runInitializationStage('final SQLCipher verification', async () => {
    await verifyDatabaseEncryption(db);
  });
}
