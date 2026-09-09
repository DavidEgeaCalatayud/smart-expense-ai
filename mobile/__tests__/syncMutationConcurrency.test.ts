import * as Crypto from 'expo-crypto';
import { claimPendingMutations } from '../src/sync/outboxRepository';
import { deleteOfflineTransaction, updateOfflineTransaction } from '../src/features/transactions/offlineTransactionMutations';
import { deleteOfflineBudget, updateOfflineBudget } from '../src/features/budgets/offlineBudgetMutations';
import { renameOfflineCategory, setOfflineCategoryArchived } from '../src/features/categories/offlineCategoryMutations';

afterEach(() => { jest.restoreAllMocks(); });

it('allows only one caller to claim an outbox batch', async () => {
  const rows = [{ mutation_id: 'mutation-1', status: 'queued' }];
  const db = {
    execAsync: jest.fn(async () => undefined),
    getAllAsync: jest.fn(async () => rows.filter((row) => row.status === 'queued').map((row) => ({ ...row }))),
    runAsync: jest.fn(async () => { rows[0]!.status = 'sending'; }),
  };
  const batches = await Promise.all([claimPendingMutations(db as never), claimPendingMutations(db as never)]);
  expect(batches.map((batch) => batch.length)).toEqual([1, 0]);
  expect(db.runAsync).toHaveBeenCalledTimes(1);
});

it.each([
  ['edit transaction', (db: never) => updateOfflineTransaction(db, 'id', { merchant: 'Shop', amount: '12.00', transactionDate: '2026-09-08' })],
  ['delete transaction', (db: never) => deleteOfflineTransaction(db, 'id')],
  ['edit budget', (db: never) => updateOfflineBudget(db, 'id', '100.00')],
  ['delete budget', (db: never) => deleteOfflineBudget(db, 'id')],
  ['rename category', (db: never) => renameOfflineCategory(db, 'id', 'Food')],
  ['archive category', (db: never) => setOfflineCategoryArchived(db, 'id', true)],
] as const)('preserves the claimed payload during %s', async (_name, mutate) => {
  const db = {
    execAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async () => ({ mutation_id: 'currently-sending' })),
    runAsync: jest.fn(),
  };
  await expect(mutate(db as never)).rejects.toThrow('being synchronized');
  expect(db.runAsync).not.toHaveBeenCalled();
  expect(db.execAsync).toHaveBeenLastCalledWith('ROLLBACK');
});

it('reads the acknowledged version inside the delete transaction so the server receives a tombstone', async () => {
  let acknowledgedVersion: number | null = null;
  jest.spyOn(Crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  const db = {
    execAsync: jest.fn(async (sql: string) => {
      // The preceding sync committed just before this local transaction acquired the connection.
      if (sql === 'BEGIN IMMEDIATE') acknowledgedVersion = 3;
    }),
    getFirstAsync: jest.fn(async (sql: string) => sql.includes('FROM transactions t')
      ? { id: 'id', sync_status: 'synced', server_version: acknowledgedVersion } : null),
    runAsync: jest.fn(async () => undefined),
  };
  await deleteOfflineTransaction(db as never, 'id');
  expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sync_outbox'),
    expect.any(String), 'transaction', 'id', 'delete', 3, null,
    expect.any(String), expect.any(String), expect.any(String));
});
