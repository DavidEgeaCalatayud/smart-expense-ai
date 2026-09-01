import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { DATABASE_NAME, LEGACY_DATABASE_NAME } from './constants';

const DATABASE_KEY_STORAGE_KEY = 'smart-expense-ai.database-key-v1';
const DATABASE_KEY_BYTES = 32;
const LEGACY_MIGRATION_COMPLETION_TABLE = '__smart_expense_sqlcipher_plaintext_migration_v1';

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function assertHexKey(value: string): string {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error('Invalid local database encryption key');
  }
  return value.toLowerCase();
}

export async function getOrCreateDatabaseKeyHex(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DATABASE_KEY_STORAGE_KEY, SECURE_OPTIONS);
  if (existing) {
    return assertHexKey(existing);
  }

  const generated = bytesToHex(await Crypto.getRandomBytesAsync(DATABASE_KEY_BYTES));
  const validated = assertHexKey(generated);
  await SecureStore.setItemAsync(DATABASE_KEY_STORAGE_KEY, validated, SECURE_OPTIONS);
  return validated;
}

export async function applyAndVerifyDatabaseEncryption(db: SQLiteDatabase): Promise<void> {
  const keyHex = await getOrCreateDatabaseKeyHex();

  // The key is generated locally as strict hexadecimal, so interpolating it cannot alter the PRAGMA.
  // This must be the first database operation that touches encrypted pages.
  await db.execAsync(`PRAGMA key = "x'${keyHex}'"`);

  const cipher = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version');
  if (!cipher?.cipher_version) {
    throw new Error(
      'SQLCipher is unavailable. Use a native development/preview build; Expo Go is not supported.',
    );
  }

  // Force a page read so a missing/wrong key fails before migrations or application queries run.
  await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sqlite_master');
}

function databasePath(databaseName: string): string {
  const directory = SQLite.defaultDatabaseDirectory.replace(/\/$/, '');
  return `${directory}/${databaseName}`;
}

async function hasApplicationSchema(db: SQLiteDatabase, database = 'main'): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM ${database}.sqlite_master
      WHERE type IN ('table', 'view', 'index', 'trigger')
        AND name NOT LIKE 'sqlite_%'`,
  );
  return (row?.count ?? 0) > 0;
}

async function hasLegacyMigrationCompletionMarker(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM main.sqlite_master
      WHERE type = 'table'
        AND name = '${LEGACY_MIGRATION_COMPLETION_TABLE}'`,
  );
  return (row?.count ?? 0) === 1;
}

async function markLegacyMigrationComplete(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(
    `CREATE TABLE ${LEGACY_MIGRATION_COMPLETION_TABLE} (
       completed_at TEXT NOT NULL
     )`,
  );
  await db.runAsync(
    `INSERT INTO ${LEGACY_MIGRATION_COMPLETION_TABLE} (completed_at) VALUES (?)`,
    new Date().toISOString(),
  );
}

async function assertDatabaseIntegrity(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ integrity_check?: string }>('PRAGMA integrity_check');
  if (result?.integrity_check !== 'ok') {
    throw new Error('SQLCipher migration integrity check failed');
  }
}

async function deleteLegacyDatabaseBestEffort(): Promise<void> {
  try {
    await SQLite.deleteDatabaseAsync(LEGACY_DATABASE_NAME);
  } catch {
    // A missing legacy file is the normal steady state after migration.
  }
}

/**
 * Migrates the pre-hardening plaintext SQLite database into the keyed SQLCipher main database.
 *
 * SQLCipher cannot encrypt a standard SQLite file in place with PRAGMA rekey. The supported path
 * is to attach the plaintext database with an empty key and copy it into the encrypted database
 * through sqlcipher_export(). The plaintext file is deleted only after the export, integrity
 * verification and an explicit completion marker all succeed.
 *
 * The completion marker is intentionally separate from ordinary application schema. sqlcipher_export
 * may leave destination schema behind if a late export step fails, so merely seeing tables in main
 * is not sufficient evidence that the legacy database is safe to delete.
 */
export async function migrateLegacyPlaintextDatabase(db: SQLiteDatabase): Promise<void> {
  const mainAlreadyHasSchema = await hasApplicationSchema(db);

  await db.runAsync('ATTACH DATABASE ? AS legacy KEY ?', databasePath(LEGACY_DATABASE_NAME), '');
  let shouldDeleteLegacy = false;
  try {
    const legacyHasSchema = await hasApplicationSchema(db, 'legacy');

    if (!legacyHasSchema) {
      // ATTACH creates an empty file when the old database is absent. Remove that empty probe file.
      shouldDeleteLegacy = true;
    } else if (await hasLegacyMigrationCompletionMarker(db)) {
      // A previous export committed fully but the process died before plaintext cleanup.
      shouldDeleteLegacy = true;
    } else if (mainAlreadyHasSchema) {
      // Never infer completion from destination schema alone: a failed sqlcipher_export can leave a
      // partially populated schema. Preserve the plaintext source and fail closed for recovery.
      throw new Error(
        'Legacy SQLite migration state is ambiguous; plaintext source preserved for recovery',
      );
    } else {
      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA legacy.user_version');
      await db.execAsync("SELECT sqlcipher_export('main', 'legacy')");
      await db.execAsync(`PRAGMA user_version = ${Math.max(0, version?.user_version ?? 0)}`);
      await assertDatabaseIntegrity(db);
      await markLegacyMigrationComplete(db);
      shouldDeleteLegacy = true;
    }
  } finally {
    await db.execAsync('DETACH DATABASE legacy');
  }

  if (shouldDeleteLegacy) {
    await deleteLegacyDatabaseBestEffort();
  }
}

export async function verifyDatabaseEncryption(db: SQLiteDatabase): Promise<string> {
  const cipher = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version');
  if (!cipher?.cipher_version) {
    throw new Error('SQLCipher verification failed');
  }
  await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sqlite_master');
  return cipher.cipher_version;
}

export const DATABASE_ENCRYPTION_METADATA = {
  databaseName: DATABASE_NAME,
  keyBytes: DATABASE_KEY_BYTES,
} as const;
