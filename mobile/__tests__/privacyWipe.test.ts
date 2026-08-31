import type { SQLiteDatabase } from 'expo-sqlite';

import { clearLocalAccountData } from '../src/database/clearAccountData';
import { clearLocalAccountDataSafely } from '../src/database/privacyWipe';
import { acquireSyncLease, releaseSyncLease } from '../src/sync/syncLease';

jest.mock('../src/database/clearAccountData', () => ({
  clearLocalAccountData: jest.fn(),
}));

jest.mock('../src/sync/syncLease', () => ({
  acquireSyncLease: jest.fn(),
  releaseSyncLease: jest.fn(),
}));

const mockedClearLocalAccountData = clearLocalAccountData as jest.MockedFunction<
  typeof clearLocalAccountData
>;
const mockedAcquireSyncLease = acquireSyncLease as jest.MockedFunction<typeof acquireSyncLease>;
const mockedReleaseSyncLease = releaseSyncLease as jest.MockedFunction<typeof releaseSyncLease>;

const db = {} as SQLiteDatabase;
const lease = { token: 'lease-token', encoded: 'encoded-lease' };

describe('privacy wipe lease', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAcquireSyncLease.mockResolvedValue(lease);
    mockedClearLocalAccountData.mockResolvedValue(undefined);
    mockedReleaseSyncLease.mockResolvedValue(undefined);
  });

  it('keeps the lease until post-wipe credential cleanup completes', async () => {
    const order: string[] = [];
    mockedClearLocalAccountData.mockImplementation(async () => {
      order.push('wipe');
    });
    const clearCredentials = jest.fn(async () => {
      order.push('credentials');
    });
    mockedReleaseSyncLease.mockImplementation(async () => {
      order.push('release');
    });

    await clearLocalAccountDataSafely(db, clearCredentials);

    expect(mockedAcquireSyncLease).toHaveBeenCalledWith(db, 30_000);
    expect(clearCredentials).toHaveBeenCalledTimes(1);
    expect(mockedReleaseSyncLease).toHaveBeenCalledWith(db, lease);
    expect(order).toEqual(['wipe', 'credentials', 'release']);
  });

  it('releases the lease when post-wipe credential cleanup fails', async () => {
    const failure = new Error('credential cleanup failed');

    await expect(
      clearLocalAccountDataSafely(db, async () => {
        throw failure;
      }),
    ).rejects.toThrow(failure);

    expect(mockedReleaseSyncLease).toHaveBeenCalledWith(db, lease);
  });
});
