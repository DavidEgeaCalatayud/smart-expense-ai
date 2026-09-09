import { createOfflineTransaction } from '../src/features/transactions/createOfflineTransaction';
import { updateOfflineTransaction } from '../src/features/transactions/offlineTransactionMutations';

const category = { id: 'salary', name: 'Salary', normalized_name: 'salary', transaction_type: 'income', archived: 0 };
const input = { merchant: 'Employer', categoryName: 'Salary', categoryId: 'salary', amount: '2400,05', transactionDate: '2026-09-09', transactionType: 'income' as const, paymentMethod: 'bank_transfer' as const, description: 'Monthly pay', isRecurring: true };
function database() {
  const writes: { sql: string; params: unknown[] }[] = [];
  return {
    writes,
    execAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async (sql: string) => sql.includes('FROM categories') ? category : null),
    runAsync: jest.fn(async (sql: string, ...params: unknown[]) => { writes.push({ sql, params }); }),
  };
}
it('queues the same rich income data that is stored in SQLCipher', async () => {
  const db = database();
  await createOfflineTransaction(db as never, input);
  const local = db.writes.find((item) => item.sql.includes('INSERT INTO transactions'))!;
  expect(local.params).toEqual(expect.arrayContaining(['Monthly pay', 'salary', 240005, 'income', 'bank_transfer', 1]));
  const outbox = db.writes.find((item) => item.sql.includes('INSERT INTO sync_outbox'))!;
  expect(JSON.parse(outbox.params[5] as string)).toMatchObject({ merchant: 'Employer', amount: '2400.05', categoryId: 'salary', transactionType: 'income', paymentMethod: 'bank_transfer', description: 'Monthly pay', isRecurring: true });
});
it('rejects a category belonging to the other transaction type atomically', async () => {
  const db = database();
  await expect(createOfflineTransaction(db as never, { ...input, transactionType: 'expense' })).rejects.toThrow('available category');
  expect(db.runAsync).not.toHaveBeenCalled();
  expect(db.execAsync).toHaveBeenLastCalledWith('ROLLBACK');
});
it('edits category/type and recurrence together while preserving the acknowledged version and source', async () => {
  const db = database();
  db.getFirstAsync.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM transactions t')) return { id: 'tx', merchant: 'Shop', amount_minor: 100, category_id: 'food', category_name: 'Food', transaction_type: 'expense', payment_method: 'card', description: '', is_recurring: 0, currency: 'EUR', source: 'import', sync_status: 'synced', server_version: 7 } as never;
    if (sql.includes('FROM categories')) return category;
    return null;
  });
  await updateOfflineTransaction(db as never, 'tx', input);
  const outbox = db.writes.find((item) => item.sql.includes('INSERT INTO sync_outbox'))!;
  expect(outbox.params[4]).toBe(7);
  expect(JSON.parse(outbox.params[5] as string)).toMatchObject({ transactionType: 'income', source: 'import', categoryId: 'salary', isRecurring: true, amount: '2400.05' });
});
