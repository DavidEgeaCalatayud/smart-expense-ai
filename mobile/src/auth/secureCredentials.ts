import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'smart-expense-ai.access-token';
const REFRESH_TOKEN_KEY = 'smart-expense-ai.refresh-token';
const USER_KEY = 'smart-expense-ai.auth-user';
const LOCAL_WIPE_REQUIRED_KEY = 'smart-expense-ai.local-wipe-required';

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface MobileCredentials {
  accessToken: string;
  refreshToken: string;
}

export interface MobileAuthUser {
  id: string;
  email: string;
  displayName: string;
}

export async function saveMobileCredentials(credentials: MobileCredentials): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, credentials.accessToken, SECURE_OPTIONS),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, credentials.refreshToken, SECURE_OPTIONS),
  ]);
}

export function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY, SECURE_OPTIONS);
}

export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY, SECURE_OPTIONS);
}

export async function saveMobileUser(user: MobileAuthUser): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user), SECURE_OPTIONS);
}

export async function getMobileUser(): Promise<MobileAuthUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY, SECURE_OPTIONS);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<MobileAuthUser>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.displayName !== 'string'
    ) {
      return null;
    }
    return parsed as MobileAuthUser;
  } catch {
    return null;
  }
}

export async function saveMobileSession(
  credentials: MobileCredentials,
  user: MobileAuthUser,
): Promise<void> {
  await Promise.all([saveMobileCredentials(credentials), saveMobileUser(user)]);
}

export async function clearMobileCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY, SECURE_OPTIONS),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, SECURE_OPTIONS),
    SecureStore.deleteItemAsync(USER_KEY, SECURE_OPTIONS),
  ]);
}

export async function invalidateMobileSessionAndRequireLocalWipe(): Promise<void> {
  await clearMobileCredentials();
  await SecureStore.setItemAsync(LOCAL_WIPE_REQUIRED_KEY, '1', SECURE_OPTIONS);
}

/**
 * Returns whether account-local SQLite data must be wiped without consuming the requirement.
 *
 * The marker must survive crashes between session restoration and the actual SQLite wipe. It is
 * therefore acknowledged only after clearLocalAccountData() has completed successfully.
 */
export async function hasLocalWipeRequirement(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(LOCAL_WIPE_REQUIRED_KEY, SECURE_OPTIONS));
}

export function acknowledgeLocalWipeRequirement(): Promise<void> {
  return SecureStore.deleteItemAsync(LOCAL_WIPE_REQUIRED_KEY, SECURE_OPTIONS);
}
