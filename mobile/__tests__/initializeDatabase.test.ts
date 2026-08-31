import type { SQLiteDatabase } from 'expo-sqlite';

import { getOrCreateDatabaseKey } from '../src/database/databaseKey';
import { initializeDatabase } from '../src/database/initializeDatabase';
import { migrateLegacyDatabaseIfNeeded } from '../src/database/legacyDatabaseMigration';
import { migrateDatabase } from '../src/database/migrations';

jest.mock('../src/database/databaseKey', () => ({
  getOrCreateDatabaseKey: jest.fn(),
}));

jest.mock('../src/database/legacyDatabaseMigration', () => ({
  migrateLegacyDatabaseIfNeeded: jest.fn(),
}));

jest.mock('../src/database/migrations', () => ({
  migrateDatabase: jest.fn(),
}));

const mockedGetDatabaseKey = getOrCreateDatabaseKey as jest.MockedFunction<
  typeof getOrCreateDatabaseKey
>;
const mockedLegacyMigration = migrateLegacyDatabaseIfNeeded as jest.MockedFunction<
  typeof migrateLegacyDatabaseIfNeeded
>;
const mockedMigrateDatabase = migrateDatabase as jest.MockedFunction<typeof migrateDatabase>;

function database(cipherVersion: string | null) {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA cipher_version') {
        return cipherVersion ? { cipher_version: cipherVersion } : null;
      }
      if (sql.includes('sqlite_master')) {
        return { count: 0 };
      }
      return null;
    }),
  } as unknown as SQLiteDatabase;
}

describe('encrypted database initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetDatabaseKey.mockResolvedValue('ab'.repeat(32));
    mockedLegacyMigration.mockResolvedValue(false);
    mockedMigrateDatabase.mockResolvedValue(undefined);
  });

  it('applies the 256-bit key as raw key material before database access', async () => {
    const db = database('4.12.0');

    await initializeDatabase(db);

    expect(db.execAsync).toHaveBeenNthCalledWith(1, `PRAGMA key = "x'${'ab'.repeat(32)}'"`);
    expect(db.getFirstAsync).toHaveBeenNthCalledWith(1, 'PRAGMA cipher_version');
    expect(db.getFirstAsync).toHaveBeenNthCalledWith(
      2,
      'SELECT COUNT(*) AS count FROM sqlite_master',
    );
    expect(mockedLegacyMigration).toHaveBeenCalledWith(db);
    expect(mockedMigrateDatabase).toHaveBeenCalledWith(db);
  });

  it('fails closed before migrations when SQLCipher is absent', async () => {
    const db = database(null);

    await expect(initializeDatabase(db)).rejects.toThrow(
      'SQLCipher is required but is not available in this native build',
    );

    expect(mockedLegacyMigration).not.toHaveBeenCalled();
    expect(mockedMigrateDatabase).not.toHaveBeenCalled();
  });
});
