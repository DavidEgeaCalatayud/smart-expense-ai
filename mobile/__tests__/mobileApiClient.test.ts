import { MobileApiClient } from '../src/api/client';
import { MobileAuthClient, type MobileTokenResponse } from '../src/auth/mobileAuthClient';
import * as credentials from '../src/auth/secureCredentials';
import * as identity from '../src/auth/deviceIdentity';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function response(status: number): Response {
  return { status, ok: status === 200,
    json: async () => ({ success: true }), text: async () => 'month,total\n2026-09,12.34' } as Response;
}

afterEach(() => { jest.restoreAllMocks(); });

it('shares one token rotation across parallel workspaces and a delayed stale 401, including CSV', async () => {
  let accessToken = 'expired-access';
  const rotation = deferred<MobileTokenResponse>();
  const started = deferred<void>();
  const delayed401 = deferred<Response>();
  jest.spyOn(credentials, 'getAccessToken').mockImplementation(async () => accessToken);
  jest.spyOn(credentials, 'getRefreshToken').mockResolvedValue('refresh-once');
  jest.spyOn(identity, 'getOrCreateDeviceId').mockResolvedValue('device-1');
  const save = jest.spyOn(credentials, 'saveMobileSession').mockImplementation(async (next) => {
    accessToken = next.accessToken;
  });
  const refresh = jest.spyOn(MobileAuthClient.prototype, 'refresh').mockImplementation(() => {
    started.resolve();
    return rotation.promise;
  });
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const token = new Headers(init?.headers).get('Authorization');
    if (token === 'Bearer expired-access') {
      return String(url).endsWith('.csv') ? delayed401.promise : response(401);
    }
    expect(token).toBe('Bearer fresh-access');
    return response(200);
  });
  const client = new MobileApiClient('https://api.example.test');
  const first = client.request('/api/v2/dashboard');
  const second = client.request('/api/v2/budgets');
  const csv = client.requestText('/api/v2/reports/monthly.csv');
  await started.promise;
  rotation.resolve({ accessToken: 'fresh-access', refreshToken: 'rotated-refresh',
    tokenType: 'Bearer', expiresIn: 900,
    user: { id: 'account-1', email: 'test@example.test', displayName: 'Test' } });
  await Promise.all([first, second]);
  delayed401.resolve(response(401));
  await expect(csv).resolves.toContain('2026-09,12.34');
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(1);
});
