import type { MobileAuthUser } from './secureCredentials';

export interface MobileTokenResponse {
  user: MobileAuthUser;
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export class MobileAuthHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MobileAuthHttpError';
  }
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
      detail?: string;
    };
    return body.error?.message ?? body.detail ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export class MobileAuthClient {
  constructor(private readonly baseUrl: string) {}

  private async jsonRequest<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new MobileAuthHttpError(response.status, await responseMessage(response));
    }
    return (await response.json()) as T;
  }

  register(input: {
    email: string;
    password: string;
    displayName: string;
    deviceId: string;
  }): Promise<MobileTokenResponse> {
    return this.jsonRequest('/api/v2/auth/mobile/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  login(input: {
    email: string;
    password: string;
    deviceId: string;
  }): Promise<MobileTokenResponse> {
    return this.jsonRequest('/api/v2/auth/mobile/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  refresh(refreshToken: string, deviceId: string): Promise<MobileTokenResponse> {
    return this.jsonRequest('/api/v2/auth/mobile/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken, deviceId }),
    });
  }

  async logout(refreshToken: string, deviceId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v2/auth/mobile/logout`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken, deviceId }),
    });
    if (!response.ok) {
      throw new MobileAuthHttpError(response.status, await responseMessage(response));
    }
  }

  async me(accessToken: string): Promise<MobileAuthUser> {
    return this.jsonRequest('/api/v1/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
