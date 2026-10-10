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

export interface RestoredSessionSnapshot {
  user: MobileAuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface LocalSessionRestoreResult {
  user: MobileAuthUser | null;
  shouldClearLocalData: boolean;
  snapshot: RestoredSessionSnapshot | null;
}

export type SessionValidationResult =
  | { status: 'valid'; user: MobileAuthUser }
  | { status: 'offline' }
  | { status: 'invalid' }
  | { status: 'superseded' };

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

async function isSnapshotCurrent(snapshot: RestoredSessionSnapshot): Promise<boolean> {
  const [accessToken, refreshToken, cachedUser] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getMobileUser(),
  ]);
  return (
    accessToken === snapshot.accessToken &&
    refreshToken === snapshot.refreshToken &&
    cachedUser?.id === snapshot.user.id
  );
}

async function staleSnapshotResult(): Promise<SessionValidationResult> {
  return (await hasLocalWipeRequirement()) ? { status: 'invalid' } : { status: 'superseded' };
}

/**
 * Restores only device-local session state.
 *
 * This function deliberately performs no network request. A complete SecureStore session can
 * therefore unlock the account-local SQLite replica immediately while Render is cold/asleep or
 * the device is offline. The durable local-wipe marker remains the first and authoritative safety
 * check.
 */
export async function restoreLocalMobileSession(): Promise<LocalSessionRestoreResult> {
  if (await hasLocalWipeRequirement()) {
    // Keep the durable marker in place until AuthProvider has actually cleared SQLite.
    await clearMobileCredentials();
    return { user: null, shouldClearLocalData: true, snapshot: null };
  }

  const [accessToken, refreshToken, cachedUser] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getMobileUser(),
  ]);

  if (!accessToken || !refreshToken || !cachedUser) {
    const hadPartialSession = Boolean(accessToken || refreshToken || cachedUser);
    if (hadPartialSession) {
      // A partial credential set is not an offline-capable session. Persist the wipe requirement
      // before returning control so a crash cannot preserve account-local SQLite accidentally.
      await invalidateMobileSessionAndRequireLocalWipe();
    }
    return { user: null, shouldClearLocalData: hadPartialSession, snapshot: null };
  }

  return {
    user: cachedUser,
    shouldClearLocalData: false,
    snapshot: { user: cachedUser, accessToken, refreshToken },
  };
}

/**
 * Revalidates a locally-restored session without being part of the startup critical path.
 *
 * Network/time-out/5xx failures preserve the offline session. Only a confirmed 401 from /me
 * followed by a confirmed 401 from refresh invalidates credentials and requires the SQLite wipe.
 * Snapshot checks prevent a slow startup request from overwriting or revoking a newer login.
 */
export async function validateRestoredMobileSession(
  client: MobileAuthClient,
  snapshot: RestoredSessionSnapshot,
): Promise<SessionValidationResult> {
  try {
    const user = await client.me(snapshot.accessToken);
    if (!(await isSnapshotCurrent(snapshot))) {
      return staleSnapshotResult();
    }
    await saveMobileSession(
      { accessToken: snapshot.accessToken, refreshToken: snapshot.refreshToken },
      user,
    );
    return { status: 'valid', user };
  } catch (error) {
    if (!isUnauthorized(error)) {
      return { status: 'offline' };
    }
  }

  // Do not rotate an old refresh token if another login/refresh superseded this startup snapshot.
  if (!(await isSnapshotCurrent(snapshot))) {
    return staleSnapshotResult();
  }

  try {
    const deviceId = await getOrCreateDeviceId();
    const refreshed = await client.refresh(snapshot.refreshToken, deviceId);
    if (!(await isSnapshotCurrent(snapshot))) {
      return staleSnapshotResult();
    }
    return { status: 'valid', user: await persistTokenResponse(refreshed) };
  } catch (error) {
    if (!isUnauthorized(error)) {
      return { status: 'offline' };
    }
    if (!(await isSnapshotCurrent(snapshot))) {
      return staleSnapshotResult();
    }
    await invalidateMobileSessionAndRequireLocalWipe();
    return { status: 'invalid' };
  }
}

/**
 * Backwards-compatible blocking restoration for callers/tests that explicitly need a fully
 * revalidated result. AuthProvider uses the split local + background validation path instead.
 */
export async function restoreMobileSession(
  client: MobileAuthClient,
): Promise<{ user: MobileAuthUser | null; shouldClearLocalData: boolean }> {
  const local = await restoreLocalMobileSession();
  if (!local.user || !local.snapshot || local.shouldClearLocalData) {
    return { user: local.user, shouldClearLocalData: local.shouldClearLocalData };
  }

  const validation = await validateRestoredMobileSession(client, local.snapshot);
  if (validation.status === 'valid') {
    return { user: validation.user, shouldClearLocalData: false };
  }
  if (validation.status === 'invalid') {
    return { user: null, shouldClearLocalData: true };
  }
  return { user: local.user, shouldClearLocalData: false };
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
