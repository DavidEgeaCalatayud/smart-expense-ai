jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'lease-token'),
}));

import type { SQLiteDatabase } from 'expo-sqlite';

import { releaseSyncLease, tryAcquireSyncLease } from '../src/sync/syncLease';

function makeDb(currentValue: string | null) {
  const getFirstAsync = jest.fn().mockResolvedValue(
    currentValue === null ? null : { value: currentValue },
  );
  const runAsync = jest.fn().mockResolvedValue(undefined);
  const db = {
    withExclusiveTransactionAsync: jest.fn(async (callback: (txn: unknown) => Promise<void>) =>
      callback({ getFirstAsync, runAsync }),
    ),
    runAsync,
  } as unknown as SQLiteDatabase;
  return { db, getFirstAsync, runAsync };
}

describe('sync runtime lease', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('acquires a lease when none is active', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const { db, runAsync } = makeDb(null);

    const lease = await tryAcquireSyncLease(db);

    expect(lease?.token).toBe('lease-token');
    expect(runAsync).toHaveBeenCalledTimes(1);
    expect(String(runAsync.mock.calls[0]?.[2])).toContain('lease-token');
  });

  it('does not steal an unexpired lease', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const { db, runAsync } = makeDb(
      JSON.stringify({ token: 'other-sync', expiresAt: 2_000 }),
    );

    await expect(tryAcquireSyncLease(db)).resolves.toBeNull();
    expect(runAsync).not.toHaveBeenCalled();
  });

  it('replaces an expired lease and releases only its exact value', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(2_000);
    const { db, runAsync } = makeDb(
      JSON.stringify({ token: 'expired-sync', expiresAt: 1_500 }),
    );

    const lease = await tryAcquireSyncLease(db);
    expect(lease).not.toBeNull();
    expect(runAsync).toHaveBeenCalledTimes(1);

    await releaseSyncLease(db, lease!);
    expect(runAsync).toHaveBeenLastCalledWith(
      'DELETE FROM sync_state WHERE key = ? AND value = ?',
      'sync_runtime_lease',
      lease!.encoded,
    );
  });
});
