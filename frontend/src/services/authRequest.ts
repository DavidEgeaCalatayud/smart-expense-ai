import { ApiNetworkError, ApiRequestError, apiFetch } from './apiClient';

// Only login and session reads may retry. Never replay reset confirmation,
// registration, or a rotating refresh token after an ambiguous response.
export async function authRequest<T>(path: string, init: RequestInit = {}, retry = false): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      return await apiFetch<T>(path, { ...init, signal: controller.signal });
    } catch (error) {
      const transient = error instanceof ApiNetworkError ||
        (error instanceof ApiRequestError && [502, 503, 504].includes(error.status));
      if (!retry || attempt > 0 || !transient) throw error;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}
