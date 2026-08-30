import type { SQLiteDatabase } from 'expo-sqlite';

import type { LocalTransactionRow } from '../database/types';

export interface TransactionRepository {
  listRecent(limit?: number): Promise<LocalTransactionRow[]>;
}

export class SqliteTransactionRepository implements TransactionRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  listRecent(limit = 100): Promise<LocalTransactionRow[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new Error('Transaction list limit must be an integer between 1 and 500');
    }

    return this.db.getAllAsync<LocalTransactionRow>(
      `SELECT
         t.*,
         c.name AS category_name
       FROM transactions t
       INNER JOIN categories c ON c.id = t.category_id
       ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC
       LIMIT ?`,
      limit,
    );
  }
}
