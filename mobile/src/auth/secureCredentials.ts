import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'smart-expense-ai.access-token';
const REFRESH_TOKEN_KEY = 'smart-expense-ai.refresh-token';

export interface MobileCredentials {
  accessToken: string;
  refreshToken: string;
}

export async function saveMobileCredentials(credentials: MobileCredentials): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, credentials.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, credentials.refreshToken),
  ]);
}

export function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearMobileCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
