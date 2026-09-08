export const API_TIMEOUT_MS = 60_000;
const requests = new Set<AbortController>();

export function abortPendingApiRequests(): void {
  requests.forEach((request) => request.abort());
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  requests.add(controller);
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    requests.delete(controller);
    init.signal?.removeEventListener('abort', abort);
  }
}
