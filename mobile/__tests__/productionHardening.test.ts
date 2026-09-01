import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

import { normalizeMobileApiBaseUrl } from '../src/api/config';
import { logoutMobileSession } from '../src/auth/sessionManager';
import {
  acknowledgeLocalWipeRequirement,
  getAccessToken,
  getRefreshToken,
  hasLocalWipeRequirement,
  invalidateMobileSessionAndRequireLocalWipe,
  saveMobileSession,
} from '../src/auth/secureCredentials';
import {
  applyAndVerifyDatabaseEncryption,
  getOrCreateDatabaseKeyHex,
  migrateLegacyPlaintextDatabase,
} from '../src/database/databaseEncryption';

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  __esModule: true,
  getRandomBytesAsync: jest.fn(),
  randomUUID: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({
  __esModule: true,
  defaultDatabaseDirectory: '/tmp/sqlite',
  deleteDatabaseAsync: jest.fn(),
}));

const mockGetRandomBytesAsync = jest.mocked(Crypto.getRandomBytesAsync);
const mockRandomUUID = jest.mocked(Crypto.randomUUID);
const mockGetItemAsync = jest.mocked(SecureStore.getItemAsync);
const mockSetItemAsync = jest.mocked(SecureStore.setItemAsync);
const mockDeleteItemAsync = jest.mocked(SecureStore.deleteItemAsync);
const mockDeleteDatabaseAsync = jest.mocked(SQLite.deleteDatabaseAsync);
const mockSecureValues = new Map<string, string>();

describe('mobile production hardening', () => {
  beforeEach(() => {
    mockSecureValues.clear();
    mockGetRandomBytesAsync.mockReset();
    mockRandomUUID.mockReset();
    mockGetItemAsync.mockReset();
    mockSetItemAsync.mockReset();
    mockDeleteItemAsync.mockReset();
    mockDeleteDatabaseAsync.mockReset();

    mockGetRandomBytesAsync.mockResolvedValue(new Uint8Array(32).fill(0xab));
    mockRandomUUID.mockReturnValue('00000000-0000-4000-8000-000000000001');
    mockGetItemAsync.mockImplementation(async (key: string) => mockSecureValues.get(key) ?? null);
    mockSetItemAsync.mockImplementation(async (key: string, value: string) => {
      mockSecureValues.set(key, value);
    });
    mockDeleteItemAsync.mockImplementation(async (key: string) => {
      mockSecureValues.delete(key);
    });
    mockDeleteDatabaseAsync.mockResolvedValue();
  });

  it('allows emulator HTTP only in development and requires HTTPS in production', () => {
    expect(normalizeMobileApiBaseUrl('http://10.0.2.2:8000/', true)).toBe(
      'http://10.0.2.2:8000',
    );
    expect(() => normalizeMobileApiBaseUrl('http://api.example.test', false)).toThrow(
      'Production mobile API traffic requires HTTPS',
    );
    expect(normalizeMobileApiBaseUrl('https://api.example.test/', false)).toBe(
      'https://api.example.test',
    );
  });

  it('creates one 256-bit SQLCipher key and reuses the SecureStore value', async () => {
    const first = await getOrCreateDatabaseKeyHex();
    const second = await getOrCreateDatabaseKeyHex();

    expect(first).toBe('ab'.repeat(32));
    expect(second).toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(mockGetRandomBytesAsync).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the native database does not expose SQLCipher', async () => {
    const execAsync = jest.fn(async () => undefined);
    const getFirstAsync = jest.fn(async (sql: string) => {
      if (sql === 'PRAGMA cipher_version') {
        return null;
      }
      return { count: 0 };
    });

    await expect(
      applyAndVerifyDatabaseEncryption({ execAsync, getFirstAsync } as never),
    ).rejects.toThrow('SQLCipher is unavailable');
    expect(execAsync).toHaveBeenCalledWith(`PRAGMA key = "x'${'ab'.repeat(32)}'"`);
    expect(getFirstAsync).toHaveBeenCalledTimes(1);
  });

  it('keys SQLCipher before reading encrypted schema pages', async () => {
    const calls: string[] = [];
    const execAsync = jest.fn(async (sql: string) => {
      calls.push(sql);
    });
    const getFirstAsync = jest.fn(async (sql: string) => {
      calls.push(sql);
      return sql === 'PRAGMA cipher_version' ? { cipher_version: '4.6.1' } : { count: 0 };
    });

    await applyAndVerifyDatabaseEncryption({ execAsync, getFirstAsync } as never);

    expect(calls[0]).toMatch(/^PRAGMA key/);
    expect(calls[1]).toBe('PRAGMA cipher_version');
    expect(calls[2]).toBe('SELECT COUNT(*) AS count FROM sqlite_master');
  });

  it('preserves the plaintext source when destination schema exists without a completion marker', async () => {
    const execAsync = jest.fn(async () => undefined);
    const runAsync = jest.fn(async () => ({ changes: 0, lastInsertRowId: 0 }));
    const getFirstAsync = jest.fn(async (sql: string) => {
      if (sql.includes("name = '__smart_expense_sqlcipher_plaintext_migration_v1'")) {
        return { count: 0 };
      }
      if (sql.includes('FROM main.sqlite_master')) {
        return { count: 1 };
      }
      if (sql.includes('FROM legacy.sqlite_master')) {
        return { count: 1 };
      }
      return null;
    });

    await expect(
      migrateLegacyPlaintextDatabase({ execAsync, runAsync, getFirstAsync } as never),
    ).rejects.toThrow('migration state is ambiguous');

    expect(execAsync).toHaveBeenCalledWith('DETACH DATABASE legacy');
    expect(mockDeleteDatabaseAsync).not.toHaveBeenCalled();
  });

  it('deletes legacy plaintext only after export, integrity verification and completion marking', async () => {
    const calls: string[] = [];
    const execAsync = jest.fn(async (sql: string) => {
      calls.push(sql);
    });
    const runAsync = jest.fn(async (sql: string) => {
      calls.push(sql);
      return { changes: 1, lastInsertRowId: 1 };
    });
    const getFirstAsync = jest.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes("name = '__smart_expense_sqlcipher_plaintext_migration_v1'")) {
        return { count: 0 };
      }
      if (sql.includes('FROM main.sqlite_master')) {
        return { count: 0 };
      }
      if (sql.includes('FROM legacy.sqlite_master')) {
        return { count: 1 };
      }
      if (sql === 'PRAGMA legacy.user_version') {
        return { user_version: 2 };
      }
      if (sql === 'PRAGMA integrity_check') {
        return { integrity_check: 'ok' };
      }
      return null;
    });

    await migrateLegacyPlaintextDatabase({ execAsync, runAsync, getFirstAsync } as never);

    expect(calls).toContain("SELECT sqlcipher_export('main', 'legacy')");
    expect(calls).toContain('PRAGMA user_version = 2');
    expect(calls).toContain('PRAGMA integrity_check');
    expect(calls.some((call) => call.startsWith('CREATE TABLE __smart_expense_sqlcipher_plaintext_migration_v1'))).toBe(
      true,
    );
    expect(mockDeleteDatabaseAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps terminal credential invalidation durable until the local wipe is acknowledged', async () => {
    await invalidateMobileSessionAndRequireLocalWipe();

    await expect(hasLocalWipeRequirement()).resolves.toBe(true);
    // Merely observing the marker must not consume it; a process death before SQLite cleanup must
    // make the next foreground launch retry the wipe.
    await expect(hasLocalWipeRequirement()).resolves.toBe(true);

    await acknowledgeLocalWipeRequirement();
    await expect(hasLocalWipeRequirement()).resolves.toBe(false);
  });

  it('records the durable wipe requirement before explicit logout can finish local cleanup', async () => {
    await saveMobileSession(
      { accessToken: 'access-token', refreshToken: 'refresh-token' },
      { id: 'user-a', email: 'user@example.test', displayName: 'User A' },
    );
    const logout = jest.fn(async () => undefined);

    await logoutMobileSession({ logout } as never);

    await expect(getAccessToken()).resolves.toBeNull();
    await expect(getRefreshToken()).resolves.toBeNull();
    await expect(hasLocalWipeRequirement()).resolves.toBe(true);
    expect(logout).toHaveBeenCalledWith(
      'refresh-token',
      '00000000-0000-4000-8000-000000000001',
    );
  });
});
