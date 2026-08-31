import type { SQLiteDatabase } from 'expo-sqlite';

import { clearLocalAccountData } from '../src/database/clearAccountData';

describe('clearLocalAccountData', () => {
  it('deletes account-scoped rows while preserving the active lease through WAL cleanup', async () => {
    const transactionExec = jest.fn().mockResolvedValue(undefined);
    const transactionRun = jest.fn().mockResolvedValue(undefined);
    const execAsync = jest.fn().mockResolvedValue(undefined);
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (callback: (txn: unknown) => Promise<void>) =>
        callback({ execAsync: transactionExec, runAsync: transactionRun }),
      ),
      execAsync,
    } as unknown as SQLiteDatabase;

    await clearLocalAccountData(db);

    expect(transactionExec.mock.calls.map(([statement]) => statement)).toEqual([
      'DELETE FROM server_cache',
      'DELETE FROM sync_conflicts',
      'DELETE FROM sync_outbox',
      'DELETE FROM transactions',
      'DELETE FROM budgets',
      'DELETE FROM categories',
    ]);
    expect(transactionRun).toHaveBeenCalledWith(
      'DELETE FROM sync_state WHERE key <> ?',
      'sync_runtime_lease',
    );
    expect(execAsync).toHaveBeenNthCalledWith(1, 'PRAGMA wal_checkpoint(TRUNCATE)');
    expect(execAsync).toHaveBeenNthCalledWith(2, 'VACUUM');
  });
});
