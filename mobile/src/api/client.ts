import { getOrCreateDeviceId } from '../auth/deviceIdentity';
import { MobileAuthClient } from '../auth/mobileAuthClient';
import {
  clearMobileCredentials,
  getAccessToken,
  getRefreshToken,
  saveMobileSession,
} from '../auth/secureCredentials';

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
  detail?: string;
}

export class MobileApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'MobileApiHttpError';
  }
}

async function parseApiError(response: Response): Promise<MobileApiHttpError> {
  try {
    const body = (await response.json()) as ApiErrorEnvelope;
    return new MobileApiHttpError(
      response.status,
      body.error?.code ?? null,
      body.error?.message ?? body.detail ?? `HTTP ${response.status}`,
    );
  } catch {
    return new MobileApiHttpError(response.status, null, `HTTP ${response.status}`);
  }
}

export class MobileApiClient {
  private readonly authClient: MobileAuthClient;
  private refreshPromise: Promise<string> | null = null;

  constructor(private readonly baseUrl: string) {
    if (!/^https?:\/\//.test(baseUrl)) {
      throw new Error('Mobile API base URL must be an absolute http(s) URL');
    }
    this.authClient = new MobileAuthClient(baseUrl);
  }

  private async refreshAccessToken(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        throw new MobileApiHttpError(401, 'authentication_required', 'Authentication required');
      }

      const deviceId = await getOrCreateDeviceId();
      try {
        const refreshed = await this.authClient.refresh(refreshToken, deviceId);
        await saveMobileSession(
          {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
          },
          refreshed.user,
        );
        return refreshed.accessToken;
      } catch (error) {
        if (
          error instanceof Error &&
          'status' in error &&
          (error as { status?: unknown }).status === 401
        ) {
          await clearMobileCredentials();
        }
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async execute(path: string, init: RequestInit, token: string | null): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await getAccessToken();
    let response = await this.execute(path, init, accessToken);

    if (response.status === 401 && accessToken) {
      const refreshedAccessToken = await this.refreshAccessToken();
      response = await this.execute(path, init, refreshedAccessToken);
    }

    if (!response.ok) {
      throw await parseApiError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
