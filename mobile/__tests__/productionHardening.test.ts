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
}));

jest.mock('expo-sqlite', () => ({
  __esModule: true,
  defaultDatabaseDirectory: '/tmp/sqlite',
  deleteDatabaseAsync: jest.fn(),
}));

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { normalizeMobileApiBaseUrl } from '../src/api/config';
import {
  consumeLocalWipeRequirement,
  invalidateMobileSessionAndRequireLocalWipe,
} from '../src/auth/secureCredentials';
import {
  applyAndVerifyDatabaseEncryption,
  getOrCreateDatabaseKeyHex,
} from '../src/database/databaseEncryption';

const mockGetRandomBytesAsync = jest.mocked(Crypto.getRandomBytesAsync);
const mockGetItemAsync = jest.mocked(SecureStore.getItemAsync);
const mockSetItemAsync = jest.mocked(SecureStore.setItemAsync);
const mockDeleteItemAsync = jest.mocked(SecureStore.deleteItemAsync);
const mockSecureValues = new Map<string, string>();

describe('mobile production hardening', () => {
  beforeEach(() => {
    mockSecureValues.clear();
    mockGetRandomBytesAsync.mockReset();
    mockGetItemAsync.mockReset();
    mockSetItemAsync.mockReset();
    mockDeleteItemAsync.mockReset();

    mockGetRandomBytesAsync.mockResolvedValue(new Uint8Array(32).fill(0xab));
    mockGetItemAsync.mockImplementation(async (key: string) => mockSecureValues.get(key) ?? null);
    mockSetItemAsync.mockImplementation(async (key: string, value: string) => {
      mockSecureValues.set(key, value);
    });
    mockDeleteItemAsync.mockImplementation(async (key: string) => {
      mockSecureValues.delete(key);
    });
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

  it('turns terminal credential invalidation into a one-shot local wipe requirement', async () => {
    await invalidateMobileSessionAndRequireLocalWipe();

    await expect(consumeLocalWipeRequirement()).resolves.toBe(true);
    await expect(consumeLocalWipeRequirement()).resolves.toBe(false);
  });
});
