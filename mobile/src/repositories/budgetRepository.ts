import type { SQLiteDatabase } from 'expo-sqlite';

import type { LocalBudgetRow } from '../database/types';

export interface LocalBudgetWithCategory extends LocalBudgetRow {
  category_name: string | null;
  category_archived: number;
}

export interface BudgetRepository {
  listAll(): Promise<LocalBudgetRow[]>;
  listMonth(month: string): Promise<LocalBudgetWithCategory[]>;
  findById(id: string): Promise<LocalBudgetRow | null>;
  findByScope(month: string, categoryId: string | null): Promise<LocalBudgetRow | null>;
}

export class SqliteBudgetRepository implements BudgetRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  listAll(): Promise<LocalBudgetRow[]> {
    return this.db.getAllAsync<LocalBudgetRow>(
      `SELECT * FROM budgets ORDER BY month DESC, category_id ASC, id ASC`,
    );
  }

  listMonth(month: string): Promise<LocalBudgetWithCategory[]> {
    return this.db.getAllAsync<LocalBudgetWithCategory>(
      `SELECT b.*, c.name AS category_name, COALESCE(c.archived, 0) AS category_archived
       FROM budgets b
       LEFT JOIN categories c ON c.id = b.category_id
       WHERE b.month = ?
       ORDER BY b.category_id IS NOT NULL ASC, c.name COLLATE NOCASE ASC, b.id ASC`,
      month,
    );
  }

  findById(id: string): Promise<LocalBudgetRow | null> {
    return this.db.getFirstAsync<LocalBudgetRow>(
      'SELECT * FROM budgets WHERE id = ? LIMIT 1',
      id,
    );
  }

  findByScope(month: string, categoryId: string | null): Promise<LocalBudgetRow | null> {
    if (categoryId === null) {
      return this.db.getFirstAsync<LocalBudgetRow>(
        'SELECT * FROM budgets WHERE month = ? AND category_id IS NULL LIMIT 1',
        month,
      );
    }
    return this.db.getFirstAsync<LocalBudgetRow>(
      'SELECT * FROM budgets WHERE month = ? AND category_id = ? LIMIT 1',
      month,
      categoryId,
    );
  }
}
