import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateLegacyDatabaseIfNeeded } from '../src/database/legacyDatabaseMigration';

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  deleteDatabaseAsync: jest.fn(),
  backupDatabaseAsync: jest.fn(),
}));

const openDatabaseAsync = SQLite.openDatabaseAsync as jest.MockedFunction<
  typeof SQLite.openDatabaseAsync
>;
const deleteDatabaseAsync = SQLite.deleteDatabaseAsync as jest.MockedFunction<
  typeof SQLite.deleteDatabaseAsync
>;
const backupDatabaseAsync = SQLite.backupDatabaseAsync as jest.MockedFunction<
  typeof SQLite.backupDatabaseAsync
>;

function legacyDatabase() {
  return {
    databasePath: "/data/user/0/app/databases/smart-expense-ai.db",
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql.includes('sqlite_master')) return { count: 3 };
      if (sql === 'PRAGMA user_version') return { user_version: 1 };
      return null;
    }),
    execAsync: jest.fn().mockResolvedValue(undefined),
    closeAsync: jest.fn().mockResolvedValue(undefined),
  } as unknown as SQLiteDatabase;
}

function encryptedDatabase(options: { failExport?: boolean } = {}) {
  let schemaChecks = 0;
  return {
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql.includes('sqlite_master')) {
        schemaChecks += 1;
        return { count: schemaChecks === 1 ? 0 : 3 };
      }
      return null;
    }),
    execAsync: jest.fn(async (sql: string) => {
      if (options.failExport && sql.includes('sqlcipher_export')) {
        throw new Error('export failed');
      }
    }),
  } as unknown as SQLiteDatabase;
}

describe('legacy plaintext SQLite migration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses SQLCipher logical export and preserves user_version before deleting plaintext', async () => {
    const legacy = legacyDatabase();
    const encrypted = encryptedDatabase();
    openDatabaseAsync.mockResolvedValue(legacy);

    await expect(migrateLegacyDatabaseIfNeeded(encrypted)).resolves.toBe(true);

    expect(legacy.execAsync).toHaveBeenCalledWith('PRAGMA wal_checkpoint(TRUNCATE)');
    expect(legacy.closeAsync).toHaveBeenCalledTimes(1);
    expect(encrypted.execAsync).toHaveBeenCalledWith(
      "ATTACH DATABASE '/data/user/0/app/databases/smart-expense-ai.db' AS legacy_plaintext KEY ''",
    );
    expect(encrypted.execAsync).toHaveBeenCalledWith(
      "SELECT sqlcipher_export('main', 'legacy_plaintext')",
    );
    expect(encrypted.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 1');
    expect(encrypted.execAsync).toHaveBeenCalledWith('DETACH DATABASE legacy_plaintext');
    expect(backupDatabaseAsync).not.toHaveBeenCalled();
    expect(deleteDatabaseAsync).toHaveBeenCalledWith('smart-expense-ai.db');
  });

  it('keeps the plaintext database when SQLCipher export fails', async () => {
    const legacy = legacyDatabase();
    const encrypted = encryptedDatabase({ failExport: true });
    openDatabaseAsync.mockResolvedValue(legacy);

    await expect(migrateLegacyDatabaseIfNeeded(encrypted)).rejects.toThrow('export failed');

    expect(encrypted.execAsync).toHaveBeenCalledWith('DETACH DATABASE legacy_plaintext');
    expect(deleteDatabaseAsync).not.toHaveBeenCalled();
    expect(backupDatabaseAsync).not.toHaveBeenCalled();
  });

  it('does nothing when the encrypted destination already has application data', async () => {
    const encrypted = {
      getFirstAsync: jest.fn().mockResolvedValue({ count: 3 }),
    } as unknown as SQLiteDatabase;

    await expect(migrateLegacyDatabaseIfNeeded(encrypted)).resolves.toBe(false);

    expect(openDatabaseAsync).not.toHaveBeenCalled();
    expect(deleteDatabaseAsync).not.toHaveBeenCalled();
  });
});
