jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { bytesToHex, getOrCreateDatabaseKey } from '../src/database/databaseKey';

const getRandomBytesAsync = Crypto.getRandomBytesAsync as jest.MockedFunction<
  typeof Crypto.getRandomBytesAsync
>;
const getItemAsync = SecureStore.getItemAsync as jest.MockedFunction<
  typeof SecureStore.getItemAsync
>;
const setItemAsync = SecureStore.setItemAsync as jest.MockedFunction<
  typeof SecureStore.setItemAsync
>;

describe('database encryption key', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('encodes bytes as fixed-width lowercase hex', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });

  it('generates and persists a 256-bit key when none exists', async () => {
    getItemAsync.mockResolvedValue(null);
    getRandomBytesAsync.mockResolvedValue(new Uint8Array(Array.from({ length: 32 }, (_, i) => i)));

    const key = await getOrCreateDatabaseKey();

    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(getRandomBytesAsync).toHaveBeenCalledWith(32);
    expect(setItemAsync).toHaveBeenCalledWith(
      'smart-expense-ai.database-key-v1',
      key,
      expect.objectContaining({ keychainAccessible: 1 }),
    );
  });

  it('reuses a valid stored key without generating a new one', async () => {
    const stored = 'ab'.repeat(32);
    getItemAsync.mockResolvedValue(stored);

    await expect(getOrCreateDatabaseKey()).resolves.toBe(stored);
    expect(getRandomBytesAsync).not.toHaveBeenCalled();
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it('fails closed when the persisted database key is malformed', async () => {
    getItemAsync.mockResolvedValue('not-a-valid-key');

    await expect(getOrCreateDatabaseKey()).rejects.toThrow('Stored database encryption key is invalid');
  });
});
