const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
export const API_V1_BASE_URL = `${API_BASE_URL}/api/v1`;

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: unknown;
  };
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status: number; code: string; requestId?: string; details?: unknown },
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) {
    return error.requestId ? `${error.message} (request ${error.requestId})` : error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  const response = await fetch(`${API_V1_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let envelope: ErrorEnvelope = {};
    try {
      envelope = (await response.json()) as ErrorEnvelope;
    } catch {
      // Non-JSON upstream failures still become a normalized client error.
    }

    throw new ApiRequestError(envelope.error?.message ?? `Request failed with status ${response.status}`, {
      status: response.status,
      code: envelope.error?.code ?? `http_${response.status}`,
      requestId: envelope.error?.requestId ?? response.headers.get('X-Request-ID') ?? undefined,
      details: envelope.error?.details,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
