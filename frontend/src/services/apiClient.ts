const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
export const API_V1_BASE_URL = `${API_BASE_URL}/api/v1`;
export const API_V2_BASE_URL = `${API_BASE_URL}/api/v2`;

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: unknown;
  };
}

export type ApiErrorKind =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'conflict'
  | 'not_found'
  | 'server'
  | 'network'
  | 'request';

export interface ApiErrorPresentation {
  kind: ApiErrorKind;
  title: string;
  message: string;
  requestId?: string;
  details?: unknown;
  retryable: boolean;
}

function classifyStatus(status: number): ApiErrorKind {
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'request';
}

function titleForKind(kind: ApiErrorKind): string {
  return {
    validation: 'Check the submitted data',
    authentication: 'Authentication required',
    authorization: 'Action not allowed',
    conflict: 'Request conflict',
    not_found: 'Resource not found',
    server: 'Server problem',
    network: 'Connection problem',
    request: 'Request failed',
  }[kind];
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly kind: ApiErrorKind;

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
    this.kind = classifyStatus(options.status);
  }
}

export class ApiNetworkError extends Error {
  readonly kind: ApiErrorKind = 'network';

  constructor(message = 'Unable to reach the API. Check your connection and try again.') {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

export function getApiErrorPresentation(error: unknown, fallback: string): ApiErrorPresentation {
  if (error instanceof ApiRequestError) {
    return {
      kind: error.kind,
      title: titleForKind(error.kind),
      message: error.message,
      requestId: error.requestId,
      details: error.details,
      retryable: error.status >= 500,
    };
  }

  if (error instanceof ApiNetworkError) {
    return {
      kind: 'network',
      title: titleForKind('network'),
      message: error.message,
      retryable: true,
    };
  }

  return {
    kind: 'request',
    title: titleForKind('request'),
    message: error instanceof Error ? error.message : fallback,
    retryable: false,
  };
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const presentation = getApiErrorPresentation(error, fallback);
  return presentation.requestId
    ? `${presentation.message} (request ${presentation.requestId})`
    : presentation.message;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  version: 'v1' | 'v2' = 'v1',
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  const baseUrl = version === 'v2' ? API_V2_BASE_URL : API_V1_BASE_URL;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers,
    });
  } catch (error) {
    throw new ApiNetworkError(error instanceof Error ? error.message : undefined);
  }

  if (!response.ok) {
    let envelope: ErrorEnvelope = {};
    try {
      envelope = (await response.json()) as ErrorEnvelope;
    } catch {
      // Non-JSON upstream failures still become a typed client error.
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
