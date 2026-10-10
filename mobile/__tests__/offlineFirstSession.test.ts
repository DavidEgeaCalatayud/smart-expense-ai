const secure = {
  accessToken: 'access-1' as string | null,
  refreshToken: 'refresh-1' as string | null,
  user: { id: 'user-1', email: 'user@example.com', displayName: 'User' } as {
    id: string; email: string; displayName: string;
  } | null,
  wipeRequired: false,
};

const invalidate = jest.fn(async () => {
  secure.accessToken = null;
  secure.refreshToken = null;
  secure.user = null;
  secure.wipeRequired = true;
});
const saveSession = jest.fn(async (
  credentials: { accessToken: string; refreshToken: string },
  user: { id: string; email: string; displayName: string },
) => {
  secure.accessToken = credentials.accessToken;
  secure.refreshToken = credentials.refreshToken;
  secure.user = user;
});

jest.mock('../src/auth/secureCredentials', () => ({
  clearMobileCredentials: jest.fn(async () => {
    secure.accessToken = null;
    secure.refreshToken = null;
    secure.user = null;
  }),
  getAccessToken: jest.fn(async () => secure.accessToken),
  getRefreshToken: jest.fn(async () => secure.refreshToken),
  getMobileUser: jest.fn(async () => secure.user),
  hasLocalWipeRequirement: jest.fn(async () => secure.wipeRequired),
  invalidateMobileSessionAndRequireLocalWipe: invalidate,
  saveMobileSession: saveSession,
}));

jest.mock('../src/auth/deviceIdentity', () => ({
  getOrCreateDeviceId: jest.fn(async () => 'device-1'),
}));

import { MobileAuthHttpError, type MobileAuthClient } from '../src/auth/mobileAuthClient';
import {
  restoreLocalMobileSession,
  validateRestoredMobileSession,
  type RestoredSessionSnapshot,
} from '../src/auth/sessionManager';

const cachedUser = { id: 'user-1', email: 'user@example.com', displayName: 'User' };

function resetLocalSession() {
  secure.accessToken = 'access-1';
  secure.refreshToken = 'refresh-1';
  secure.user = cachedUser;
  secure.wipeRequired = false;
  invalidate.mockClear();
  saveSession.mockClear();
}

function client(overrides: Partial<Pick<MobileAuthClient, 'me' | 'refresh'>>): MobileAuthClient {
  return {
    me: jest.fn(),
    refresh: jest.fn(),
    ...overrides,
  } as unknown as MobileAuthClient;
}

beforeEach(resetLocalSession);

it('restores a complete local session without any network dependency', async () => {
  await expect(restoreLocalMobileSession()).resolves.toEqual({
    user: cachedUser,
    shouldClearLocalData: false,
    snapshot: {
      user: cachedUser,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    },
  });
  expect(invalidate).not.toHaveBeenCalled();
});

it('preserves the offline session when /auth/me cannot reach the server', async () => {
  const snapshot: RestoredSessionSnapshot = {
    user: cachedUser,
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
  };
  const authClient = client({
    me: jest.fn().mockRejectedValue(new TypeError('Network unavailable')),
  });

  await expect(validateRestoredMobileSession(authClient, snapshot)).resolves.toEqual({
    status: 'offline',
  });
  expect(authClient.refresh).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
});

it('invalidates only after both access and refresh credentials are rejected with 401', async () => {
  const snapshot: RestoredSessionSnapshot = {
    user: cachedUser,
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
  };
  const authClient = client({
    me: jest.fn().mockRejectedValue(new MobileAuthHttpError(401, 'expired')),
    refresh: jest.fn().mockRejectedValue(new MobileAuthHttpError(401, 'revoked')),
  });

  await expect(validateRestoredMobileSession(authClient, snapshot)).resolves.toEqual({
    status: 'invalid',
  });
  expect(authClient.refresh).toHaveBeenCalledWith('refresh-1', 'device-1');
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(secure.wipeRequired).toBe(true);
});

it('does not rotate or invalidate a startup snapshot superseded by a newer session', async () => {
  const snapshot: RestoredSessionSnapshot = {
    user: cachedUser,
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
  };
  const me = jest.fn().mockImplementation(async () => {
    secure.accessToken = 'access-2';
    secure.refreshToken = 'refresh-2';
    secure.user = { id: 'user-2', email: 'other@example.com', displayName: 'Other' };
    throw new MobileAuthHttpError(401, 'old access token');
  });
  const authClient = client({ me });

  await expect(validateRestoredMobileSession(authClient, snapshot)).resolves.toEqual({
    status: 'superseded',
  });
  expect(authClient.refresh).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
});
