export const API_TIMEOUT_MS = 60_000;
export class ApiTimeoutError extends Error {
  constructor() { super('The server took too long to respond. Please try again.'); this.name = 'ApiTimeoutError'; }
}

const requests = new Set<AbortController>();
let cancellationVersion = 0;
export function apiCancellationVersion(): number { return cancellationVersion; }

export function abortPendingApiRequests(): void {
  cancellationVersion += 1;
  requests.forEach((request) => request.abort());
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  requests.add(controller);
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; abort(); }, API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new ApiTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    requests.delete(controller);
    init.signal?.removeEventListener('abort', abort);
  }
}
