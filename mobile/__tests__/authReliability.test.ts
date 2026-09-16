import { abortPendingApiRequests, API_TIMEOUT_MS } from '../src/api/fetchWithTimeout';
import { MobileAuthClient } from '../src/auth/mobileAuthClient';
const input = { email: 'native@example.com', password: 'test-password-123', deviceId: 'device-id' };
function response(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: jest.fn().mockResolvedValue(body) } as unknown as Response;
}
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
it.each([502, 503, 504])('retries one temporary %s login response', async (status) => {
  jest.useFakeTimers();
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(status)).mockResolvedValueOnce(response(200, { accessToken: 'new' }));
  const result = new MobileAuthClient('https://api.example.test').login(input);
  await jest.advanceTimersByTimeAsync(1500);
  await expect(result).resolves.toEqual({ accessToken: 'new' });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([400, 401, 403, 422, 429, 500])('does not retry login %s', async (status) => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(status));
  await expect(new MobileAuthClient('https://api.example.test').login(input)).rejects.toMatchObject({ status });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('retries a timed-out cold start once', async () => {
  jest.useFakeTimers();
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
  })).mockResolvedValueOnce(response(200, { accessToken: 'new' }));
  const result = new MobileAuthClient('https://api.example.test').login(input);
  await jest.advanceTimersByTimeAsync(API_TIMEOUT_MS + 1500);
  await expect(result).resolves.toEqual({ accessToken: 'new' });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('does not revive a login cancelled during backoff', async () => {
  jest.useFakeTimers();
  const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network failure'));
  const result = expect(new MobileAuthClient('https://api.example.test').login(input)).rejects.toMatchObject({ name: 'AbortError' });
  await jest.advanceTimersByTimeAsync(100);
  abortPendingApiRequests();
  await jest.advanceTimersByTimeAsync(1500); await result;
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('never retries rotating refresh or single-use confirmation', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network failure'));
  const client = new MobileAuthClient('https://api.example.test');
  await expect(client.refresh('refresh', 'device')).rejects.toThrow();
  await expect(client.confirmPasswordReset('a'.repeat(43), 'new-password-123')).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('uses the shared endpoints and accepts a 204 confirmation without parsing JSON', async () => {
  const noContent = response(204);
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(202, { message: 'neutral' })).mockResolvedValueOnce(noContent);
  const client = new MobileAuthClient('https://api.example.test');
  await client.requestPasswordReset(' native@example.com ');
  await expect(client.confirmPasswordReset('a'.repeat(43), 'new-password-123')).resolves.toBeUndefined();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://api.example.test/api/v1/auth/password-reset/request', 'https://api.example.test/api/v1/auth/password-reset/confirm']);
  expect(noContent.json).not.toHaveBeenCalled();
});
