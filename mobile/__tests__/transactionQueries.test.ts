import { DatabaseSync } from 'node:sqlite';
import { transactionQuery } from '../src/repositories/transactionRepository';

it('searches all rows before pagination, escapes wildcards and sorts integer amounts', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE categories (id TEXT, name TEXT);
    CREATE TABLE transactions (id TEXT, category_id TEXT, merchant TEXT, description TEXT,
      amount_minor INTEGER, transaction_date TEXT, created_at TEXT, transaction_type TEXT,
      is_recurring INTEGER, sync_status TEXT);
    INSERT INTO categories VALUES ('food', 'Food'), ('salary', 'Salary');`);
  const insert = db.prepare('INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 250; i++) insert.run(String(i), 'food', `Shop ${i}`, 'Daily shopping', i + 1,
    '2026-09-01', '2026-09-01', 'expense', 0, 'synced');
  insert.run('salary', 'salary', 'Employer', 'Monthly salary', 240005, '2026-09-02', '2026-09-02', 'income', 1, 'pending');
  insert.run('literal', 'food', '100%_shop', 'Literal search', 900, '2026-08-02', '2026-08-02', 'expense', 0, 'synced');
  const query = (filters: Parameters<typeof transactionQuery>[0], limit = 50, offset = 0) => {
    const request = transactionQuery(filters, limit, offset);
    return db.prepare(request.sql).all(...request.params);
  };
  expect(query({ search: 'shop 249' })).toHaveLength(1);
  expect(query({ search: 'salary', month: '2026-09', type: 'income', recurring: true, status: 'pending' }).map((row) => row.id)).toEqual(['salary']);
  expect(query({ search: '%_' }).map((row) => row.id)).toEqual(['literal']);
  expect(query({ search: "' OR 1=1 --" })).toEqual([]);
  expect(query({ sort: 'highest' }, 2).map((row) => row.amount_minor)).toEqual([240005, 900]);
  expect(query({ sort: 'lowest' }, 2).map((row) => row.amount_minor)).toEqual([1, 2]);
  expect(query({ month: '2026-09', categoryId: 'food', sort: 'lowest' }, 50, 200)).toHaveLength(50);
  expect(query({ month: '2026-09', categoryId: 'food', sort: 'lowest' }, 50, 250)).toEqual([]);
  expect(query({ dateFrom: '2026-09-02', dateTo: '2026-09-02' }).map((row) => row.id)).toEqual(['salary']);
  expect(() => transactionQuery({ dateFrom: '2026-09-02', dateTo: '2026-09-01' })).toThrow('end date');
  expect(query({ sort: 'oldest' }, 1)[0]?.id).toBe('literal');
  db.close();
});
