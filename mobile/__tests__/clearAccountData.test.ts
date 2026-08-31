import type { SQLiteDatabase } from 'expo-sqlite';

import { clearLocalAccountData } from '../src/database/clearAccountData';

describe('clearLocalAccountData', () => {
  it('deletes all account-scoped rows then truncates WAL and vacuums', async () => {
    const transactionExec = jest.fn().mockResolvedValue(undefined);
    const execAsync = jest.fn().mockResolvedValue(undefined);
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (callback: (txn: unknown) => Promise<void>) =>
        callback({ execAsync: transactionExec }),
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
      'DELETE FROM sync_state',
    ]);
    expect(execAsync).toHaveBeenNthCalledWith(1, 'PRAGMA wal_checkpoint(TRUNCATE)');
    expect(execAsync).toHaveBeenNthCalledWith(2, 'VACUUM');
  });
});
