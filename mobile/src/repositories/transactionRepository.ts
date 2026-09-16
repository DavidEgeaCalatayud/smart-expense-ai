import type { SQLiteDatabase } from 'expo-sqlite';
import { isCalendarDate } from '../features/transactions/validation';
import type { LocalTransactionRow } from '../database/types';

export interface TransactionFilters {
  search?: string;
  month?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  type?: 'expense' | 'income';
  recurring?: boolean;
  status?: LocalTransactionRow['sync_status'];
  sort?: 'newest' | 'oldest' | 'highest' | 'lowest';
}
const SORT = {
  newest: 't.transaction_date DESC, t.created_at DESC, t.id DESC',
  oldest: 't.transaction_date ASC, t.created_at ASC, t.id ASC',
  highest: 't.amount_minor DESC, t.transaction_date DESC, t.id DESC',
  lowest: 't.amount_minor ASC, t.transaction_date DESC, t.id DESC',
};

// All filters run before LIMIT, against the entire encrypted replica. Money sorts as integer cents.
export function transactionQuery(filters: TransactionFilters = {}, limit = 100, offset = 0) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('Transaction list limit must be an integer between 1 and 500');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid transaction offset');
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  const add = (sql: string, value: string | number) => { conditions.push(sql); params.push(value); };
  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim().replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push("(t.merchant LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')");
    params.push(pattern, pattern, pattern);
  }
  if (filters.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.month)) throw new Error('Choose a valid month');
    add('t.transaction_date >= ?', `${filters.month}-01`);
    add('t.transaction_date <= ?', `${filters.month}-31`);
  }
  if (filters.dateFrom && !isCalendarDate(filters.dateFrom)) throw new Error('Choose a valid start date');
  if (filters.dateTo && !isCalendarDate(filters.dateTo)) throw new Error('Choose a valid end date');
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw new Error('The end date must be on or after the start date');
  if (filters.dateFrom) add('t.transaction_date >= ?', filters.dateFrom);
  if (filters.dateTo) add('t.transaction_date <= ?', filters.dateTo);
  if (filters.categoryId) add('t.category_id = ?', filters.categoryId);
  if (filters.type) add('t.transaction_type = ?', filters.type);
  if (filters.recurring !== undefined) add('t.is_recurring = ?', filters.recurring ? 1 : 0);
  if (filters.status) add('t.sync_status = ?', filters.status);
  const sort = filters.sort ?? 'newest';
  const order = Object.hasOwn(SORT, sort) ? SORT[sort] : null;
  if (!order) throw new Error('Choose a valid sort order');
  return {
    sql: `SELECT t.*, c.name AS category_name FROM transactions t
      INNER JOIN categories c ON c.id = t.category_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY ${order} LIMIT ? OFFSET ?`,
    params: [...params, limit, offset],
  };
}

export interface TransactionRepository { listRecent(limit?: number): Promise<LocalTransactionRow[]> }
export class SqliteTransactionRepository implements TransactionRepository {
  constructor(private readonly db: SQLiteDatabase) {}
  listRecent(limit = 100) { return this.list({}, limit); }
  list(filters: TransactionFilters = {}, limit = 100, offset = 0): Promise<LocalTransactionRow[]> {
    const { sql, params } = transactionQuery(filters, limit, offset);
    return this.db.getAllAsync<LocalTransactionRow>(sql, ...params);
  }
}
