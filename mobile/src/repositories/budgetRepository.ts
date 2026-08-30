import type { SQLiteDatabase } from 'expo-sqlite';

import type { LocalBudgetRow } from '../database/types';

export interface BudgetRepository {
  listAll(): Promise<LocalBudgetRow[]>;
}

export class SqliteBudgetRepository implements BudgetRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  listAll(): Promise<LocalBudgetRow[]> {
    return this.db.getAllAsync<LocalBudgetRow>(
      `SELECT * FROM budgets ORDER BY month DESC, category_id ASC, id ASC`,
    );
  }
}
