import { afterEach, describe, expect, it, vi } from 'vitest';
import { authRequest } from './authRequest';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('Authentication retry', () => {
  it.each([502, 503, 504])('retries a transient %s once then succeeds', async (status) => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status })).mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const result = authRequest('/auth/login', { method: 'POST' }, true);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([400, 401, 403, 422, 429, 500])('does not retry %s responses', async (status) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status }));
    await expect(authRequest('/auth/login', {}, true)).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('never replays recovery confirmation on a lost response', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network failure'));
    await expect(authRequest('/auth/password-reset/confirm', { method: 'POST' })).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('stops after the second network failure', async () => {
    vi.useFakeTimers();
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network failure'));
    const result = expect(authRequest('/auth/login', {}, true)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1500);
    await result;
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
