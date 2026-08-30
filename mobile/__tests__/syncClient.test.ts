import { MobileApiClient } from '../src/api/client';
import { SyncClient } from '../src/sync/syncClient';

const pushResponse = {
  protocolVersion: 'sync-v1' as const,
  serverTime: '2026-08-30T18:00:00.000Z',
  results: [],
  conflicts: [],
};

describe('SyncClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts ordered mutations to sync-v1 push', async () => {
    const request = jest.spyOn(MobileApiClient.prototype, 'request').mockResolvedValue(pushResponse);
    const client = new SyncClient(new MobileApiClient('https://api.example.test'));
    const payload = {
      protocolVersion: 'sync-v1' as const,
      deviceId: 'device-1',
      mutations: [
        {
          mutationId: 'mutation-1',
          entityId: 'entity-1',
          entityType: 'transaction' as const,
          operation: 'delete' as const,
          baseVersion: 2,
          clientOccurredAt: '2026-08-30T18:00:00.000Z',
        },
      ],
    };

    await client.push(payload);

    expect(request).toHaveBeenCalledWith('/api/v2/sync/push', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  });

  it('uses opaque cursor and bounded pull pagination', async () => {
    jest.spyOn(MobileApiClient.prototype, 'request').mockResolvedValue({
      protocolVersion: 'sync-v1',
      serverTime: '2026-08-30T18:00:00.000Z',
      changes: [],
      nextCursor: 'opaque-next',
      hasMore: false,
    });
    const request = jest.spyOn(MobileApiClient.prototype, 'request');
    const client = new SyncClient(new MobileApiClient('https://api.example.test'));

    await client.pull('opaque cursor/+value', 77);

    expect(request).toHaveBeenCalledWith(
      '/api/v2/sync/pull?cursor=opaque+cursor%2F%2Bvalue&limit=77',
    );
  });

  it('carries bootstrap snapshot and page tokens without parsing them', async () => {
    jest.spyOn(MobileApiClient.prototype, 'request').mockResolvedValue({
      protocolVersion: 'sync-v1',
      serverTime: '2026-08-30T18:00:00.000Z',
      changes: [],
      snapshotToken: 'snapshot-opaque',
      nextPageToken: null,
      establishedCursor: 'cursor-opaque',
    });
    const request = jest.spyOn(MobileApiClient.prototype, 'request');
    const client = new SyncClient(new MobileApiClient('https://api.example.test'));

    await client.bootstrap({
      limit: 50,
      snapshotToken: 'snapshot/opaque',
      pageToken: 'page+opaque',
    });

    expect(request).toHaveBeenCalledWith(
      '/api/v2/sync/bootstrap?limit=50&snapshotToken=snapshot%2Fopaque&pageToken=page%2Bopaque',
    );
  });
});
