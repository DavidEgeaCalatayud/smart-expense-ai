import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { LEGACY_DATABASE_NAME } from './constants';

const LEGACY_ALIAS = 'legacy_plaintext';

async function hasApplicationSchema(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM sqlite_master
     WHERE type = 'table' AND name IN ('transactions', 'categories', 'sync_outbox')`,
  );
  return (row?.count ?? 0) > 0;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

async function readUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (!Number.isInteger(version) || version < 0) {
    throw new Error('Legacy SQLite user_version is invalid');
  }
  return version;
}

export async function migrateLegacyDatabaseIfNeeded(
  encryptedDb: SQLiteDatabase,
): Promise<boolean> {
  if (await hasApplicationSchema(encryptedDb)) {
    return false;
  }

  const legacyDb = await SQLite.openDatabaseAsync(LEGACY_DATABASE_NAME);
  let legacyPath: string | null = null;
  let legacyUserVersion = 0;
  try {
    if (!(await hasApplicationSchema(legacyDb))) {
      return false;
    }

    await legacyDb.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    legacyUserVersion = await readUserVersion(legacyDb);
    legacyPath = legacyDb.databasePath;
  } finally {
    await legacyDb.closeAsync();
  }

  if (!legacyPath) {
    return false;
  }

  // SQLCipher's SQLite Online Backup API cannot convert a plaintext source into
  // an encrypted destination. Attach the legacy file with an explicit empty key
  // and use sqlcipher_export(target, source) instead.
  const escapedPath = escapeSqlString(legacyPath);
  let attached = false;
  try {
    await encryptedDb.execAsync(
      `ATTACH DATABASE '${escapedPath}' AS ${LEGACY_ALIAS} KEY ''`,
    );
    attached = true;
    await encryptedDb.execAsync(`SELECT sqlcipher_export('main', '${LEGACY_ALIAS}')`);
    // sqlcipher_export intentionally does not copy SQLite user_version.
    await encryptedDb.execAsync(`PRAGMA user_version = ${legacyUserVersion}`);

    if (!(await hasApplicationSchema(encryptedDb))) {
      throw new Error('Legacy SQLite migration did not produce the application schema');
    }
  } finally {
    if (attached) {
      await encryptedDb.execAsync(`DETACH DATABASE ${LEGACY_ALIAS}`);
    }
  }

  // Delete plaintext data only after the encrypted destination has been exported
  // and verified successfully. Any exception above leaves the legacy file intact.
  await SQLite.deleteDatabaseAsync(LEGACY_DATABASE_NAME);
  return true;
}
