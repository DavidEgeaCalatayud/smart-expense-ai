const secureValues = new Map<string, string>();
const getRandomBytesAsync = jest.fn(async (count: number) => new Uint8Array(count).fill(0xab));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async (key: string) => secureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureValues.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    secureValues.delete(key);
  }),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync,
}));

jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: '/tmp/sqlite',
  deleteDatabaseAsync: jest.fn(async () => undefined),
}));

import { normalizeMobileApiBaseUrl } from '../src/api/config';
import {
  consumeLocalWipeRequirement,
  invalidateMobileSessionAndRequireLocalWipe,
} from '../src/auth/secureCredentials';
import { getOrCreateDatabaseKeyHex } from '../src/database/databaseEncryption';

describe('mobile production hardening', () => {
  beforeEach(() => {
    secureValues.clear();
    getRandomBytesAsync.mockClear();
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
    expect(getRandomBytesAsync).toHaveBeenCalledTimes(1);
  });

  it('turns terminal credential invalidation into a one-shot local wipe requirement', async () => {
    await invalidateMobileSessionAndRequireLocalWipe();

    await expect(consumeLocalWipeRequirement()).resolves.toBe(true);
    await expect(consumeLocalWipeRequirement()).resolves.toBe(false);
  });
});
