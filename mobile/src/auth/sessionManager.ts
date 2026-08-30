import { getOrCreateDeviceId } from './deviceIdentity';
import { MobileAuthClient, MobileAuthHttpError, type MobileTokenResponse } from './mobileAuthClient';
import {
  clearMobileCredentials,
  getAccessToken,
  getMobileUser,
  getRefreshToken,
  saveMobileSession,
  type MobileAuthUser,
} from './secureCredentials';

export interface SessionRestoreResult {
  user: MobileAuthUser | null;
  shouldClearLocalData: boolean;
}

async function persistTokenResponse(response: MobileTokenResponse): Promise<MobileAuthUser> {
  await saveMobileSession(
    {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    },
    response.user,
  );
  return response.user;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof MobileAuthHttpError && error.status === 401;
}

export async function restoreMobileSession(
  client: MobileAuthClient,
): Promise<SessionRestoreResult> {
  const [accessToken, refreshToken, cachedUser] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getMobileUser(),
  ]);

  if (!accessToken || !refreshToken || !cachedUser) {
    const hadPartialSession = Boolean(accessToken || refreshToken || cachedUser);
    if (hadPartialSession) {
      await clearMobileCredentials();
    }
    return { user: null, shouldClearLocalData: hadPartialSession };
  }

  try {
    const user = await client.me(accessToken);
    await saveMobileSession({ accessToken, refreshToken }, user);
    return { user, shouldClearLocalData: false };
  } catch (error) {
    if (!isUnauthorized(error)) {
      // Network outages and transient server failures must not destroy the offline session.
      return { user: cachedUser, shouldClearLocalData: false };
    }
  }

  try {
    const deviceId = await getOrCreateDeviceId();
    const refreshed = await client.refresh(refreshToken, deviceId);
    return {
      user: await persistTokenResponse(refreshed),
      shouldClearLocalData: false,
    };
  } catch (error) {
    if (!isUnauthorized(error)) {
      return { user: cachedUser, shouldClearLocalData: false };
    }
    await clearMobileCredentials();
    return { user: null, shouldClearLocalData: true };
  }
}

export async function loginMobileSession(
  client: MobileAuthClient,
  email: string,
  password: string,
): Promise<MobileAuthUser> {
  const deviceId = await getOrCreateDeviceId();
  return persistTokenResponse(await client.login({ email, password, deviceId }));
}

export async function registerMobileSession(
  client: MobileAuthClient,
  email: string,
  password: string,
  displayName: string,
): Promise<MobileAuthUser> {
  const deviceId = await getOrCreateDeviceId();
  return persistTokenResponse(
    await client.register({ email, password, displayName, deviceId }),
  );
}

export async function logoutMobileSession(client: MobileAuthClient): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      const deviceId = await getOrCreateDeviceId();
      await client.logout(refreshToken, deviceId);
    } catch {
      // Local logout is authoritative for device privacy even when the network is unavailable.
    }
  }
  await clearMobileCredentials();
}
