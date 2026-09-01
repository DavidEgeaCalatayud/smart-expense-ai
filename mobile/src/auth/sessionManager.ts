import { getOrCreateDeviceId } from './deviceIdentity';
import { MobileAuthClient, MobileAuthHttpError, type MobileTokenResponse } from './mobileAuthClient';
import {
  clearMobileCredentials,
  getAccessToken,
  getMobileUser,
  getRefreshToken,
  hasLocalWipeRequirement,
  invalidateMobileSessionAndRequireLocalWipe,
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
  if (await hasLocalWipeRequirement()) {
    // Keep the durable marker in place until AuthProvider has actually cleared SQLite.
    await clearMobileCredentials();
    return { user: null, shouldClearLocalData: true };
  }

  const [accessToken, refreshToken, cachedUser] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getMobileUser(),
  ]);

  if (!accessToken || !refreshToken || !cachedUser) {
    const hadPartialSession = Boolean(accessToken || refreshToken || cachedUser);
    if (hadPartialSession) {
      // Persist the wipe requirement before returning control to the UI. A process death between
      // session restoration and SQLite cleanup must not make the cleanup disappear.
      await invalidateMobileSessionAndRequireLocalWipe();
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
    await invalidateMobileSessionAndRequireLocalWipe();
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

  // Record the local deletion requirement before the UI starts wiping SQLite. This keeps logout
  // crash-safe: a process death after credentials are removed still retries the wipe on startup.
  await invalidateMobileSessionAndRequireLocalWipe();
}
