import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { DATABASE_NAME, LEGACY_DATABASE_NAME } from './constants';

const DATABASE_KEY_STORAGE_KEY = 'smart-expense-ai.database-key-v1';
const DATABASE_KEY_BYTES = 32;

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
 * through sqlcipher_export(). The plaintext file is deleted only after the export succeeds.
 */
export async function migrateLegacyPlaintextDatabase(db: SQLiteDatabase): Promise<void> {
  if (await hasApplicationSchema(db)) {
    // The encrypted database is already initialized. Remove any stale plaintext predecessor left
    // behind by an interrupted post-export cleanup.
    await deleteLegacyDatabaseBestEffort();
    return;
  }

  await db.runAsync('ATTACH DATABASE ? AS legacy KEY ?', databasePath(LEGACY_DATABASE_NAME), '');
  let exportSucceeded = false;
  try {
    if (await hasApplicationSchema(db, 'legacy')) {
      const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA legacy.user_version');
      await db.execAsync("SELECT sqlcipher_export('main', 'legacy')");
      await db.execAsync(`PRAGMA user_version = ${Math.max(0, version?.user_version ?? 0)}`);
      await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sqlite_master');
    }
    exportSucceeded = true;
  } finally {
    await db.execAsync('DETACH DATABASE legacy');
  }

  if (exportSucceeded) {
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
