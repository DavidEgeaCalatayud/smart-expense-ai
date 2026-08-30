import { getAccessToken } from '../auth/secureCredentials';

export class MobileApiClient {
  constructor(private readonly baseUrl: string) {
    if (!/^https?:\/\//.test(baseUrl)) {
      throw new Error('Mobile API base URL must be an absolute http(s) URL');
    }
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new Error(`Mobile API request failed with HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
