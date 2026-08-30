import type {
  SyncBootstrapPage,
  SyncPullPage,
  SyncPushRequest,
  SyncPushResponse,
} from '@smart-expense-ai/api-contracts';

import { MobileApiClient } from '../api/client';

export class SyncClient {
  constructor(private readonly api: MobileApiClient) {}

  push(request: SyncPushRequest): Promise<SyncPushResponse> {
    return this.api.request('/api/v2/sync/push', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  pull(cursor: string, limit = 100): Promise<SyncPullPage> {
    const query = new URLSearchParams({ cursor, limit: String(limit) });
    return this.api.request(`/api/v2/sync/pull?${query.toString()}`);
  }

  bootstrap(input: {
    limit?: number;
    snapshotToken?: string | null;
    pageToken?: string | null;
  } = {}): Promise<SyncBootstrapPage> {
    const query = new URLSearchParams({ limit: String(input.limit ?? 100) });
    if (input.snapshotToken) {
      query.set('snapshotToken', input.snapshotToken);
    }
    if (input.pageToken) {
      query.set('pageToken', input.pageToken);
    }
    return this.api.request(`/api/v2/sync/bootstrap?${query.toString()}`);
  }
}
