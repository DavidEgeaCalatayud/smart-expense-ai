const mockSecure = {
  accessToken: 'access-1' as string | null,
  refreshToken: 'refresh-1' as string | null,
  user: { id: 'user-1', email: 'user@example.com', displayName: 'User' } as {
    id: string; email: string; displayName: string;
  } | null,
  wipeRequired: false,
};

const mockInvalidate = jest.fn(async () => {
  mockSecure.accessToken = null;
  mockSecure.refreshToken = null;
  mockSecure.user = null;
  mockSecure.wipeRequired = true;
});
const mockSaveSession = jest.fn(async (
  credentials: { accessToken: string; refreshToken: string },
  user: { id: string; email: string; displayName: string },
) => {
  mockSecure.accessToken = credentials.accessToken;
  mockSecure.refreshToken = credentials.refreshToken;
  mockSecure.user = user;
});

jest.mock('../src/auth/secureCredentials', () => ({
  clearMobileCredentials: jest.fn(async () => {
    mockSecure.accessToken = null;
    mockSecure.refreshToken = null;
    mockSecure.user = null;
  }),
  getAccessToken: jest.fn(async () => mockSecure.accessToken),
  getRefreshToken: jest.fn(async () => mockSecure.refreshToken),
  getMobileUser: jest.fn(async () => mockSecure.user),
  hasLocalWipeRequirement: jest.fn(async () => mockSecure.wipeRequired),
  invalidateMobileSessionAndRequireLocalWipe: mockInvalidate,
  saveMobileSession: mockSaveSession,
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
  mockSecure.accessToken = 'access-1';
  mockSecure.refreshToken = 'refresh-1';
  mockSecure.user = cachedUser;
  mockSecure.wipeRequired = false;
  mockInvalidate.mockClear();
  mockSaveSession.mockClear();
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
  expect(mockInvalidate).not.toHaveBeenCalled();
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
  expect(mockInvalidate).not.toHaveBeenCalled();
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
  expect(mockInvalidate).toHaveBeenCalledTimes(1);
  expect(mockSecure.wipeRequired).toBe(true);
});

it('does not rotate or invalidate a startup snapshot superseded by a newer session', async () => {
  const snapshot: RestoredSessionSnapshot = {
    user: cachedUser,
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
  };
  const me = jest.fn().mockImplementation(async () => {
    mockSecure.accessToken = 'access-2';
    mockSecure.refreshToken = 'refresh-2';
    mockSecure.user = { id: 'user-2', email: 'other@example.com', displayName: 'Other' };
    throw new MobileAuthHttpError(401, 'old access token');
  });
  const authClient = client({ me });

  await expect(validateRestoredMobileSession(authClient, snapshot)).resolves.toEqual({
    status: 'superseded',
  });
  expect(authClient.refresh).not.toHaveBeenCalled();
  expect(mockInvalidate).not.toHaveBeenCalled();
});
