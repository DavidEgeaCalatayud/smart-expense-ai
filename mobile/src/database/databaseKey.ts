import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DATABASE_KEY_STORAGE_KEY = 'smart-expense-ai.database-key-v1';
const DATABASE_KEY_BYTES = 32;

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function getOrCreateDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DATABASE_KEY_STORAGE_KEY, SECURE_OPTIONS);
  if (existing) {
    if (!/^[0-9a-f]{64}$/.test(existing)) {
      throw new Error('Stored database encryption key is invalid');
    }
    return existing;
  }

  const generated = bytesToHex(await Crypto.getRandomBytesAsync(DATABASE_KEY_BYTES));
  await SecureStore.setItemAsync(DATABASE_KEY_STORAGE_KEY, generated, SECURE_OPTIONS);
  return generated;
}

export async function deleteDatabaseKey(): Promise<void> {
  await SecureStore.deleteItemAsync(DATABASE_KEY_STORAGE_KEY, SECURE_OPTIONS);
}
