import type { SQLiteDatabase } from 'expo-sqlite';

import type { LocalCategoryRow } from '../database/types';

export interface LocalCategoryWithUsage extends LocalCategoryRow {
  transaction_count: number;
}

export interface CategoryRepository {
  listActive(): Promise<LocalCategoryRow[]>;
  listManaged(): Promise<LocalCategoryWithUsage[]>;
  listActiveExpense(): Promise<LocalCategoryRow[]>;
  findById(id: string): Promise<LocalCategoryRow | null>;
  findByName(name: string, type: 'expense' | 'income'): Promise<LocalCategoryRow | null>;
  findActiveByName(name: string, type: 'expense' | 'income'): Promise<LocalCategoryRow | null>;
}

export class SqliteCategoryRepository implements CategoryRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  listActive(): Promise<LocalCategoryRow[]> {
    return this.db.getAllAsync<LocalCategoryRow>(
      `SELECT * FROM categories WHERE archived = 0 ORDER BY transaction_type ASC, name COLLATE NOCASE ASC, id ASC`,
    );
  }

  listManaged(): Promise<LocalCategoryWithUsage[]> {
    return this.db.getAllAsync<LocalCategoryWithUsage>(
      `SELECT c.*, COUNT(t.id) AS transaction_count
       FROM categories c
       LEFT JOIN transactions t ON t.category_id = c.id
       GROUP BY c.id
       ORDER BY c.transaction_type ASC, c.archived ASC, c.system_category DESC,
                c.name COLLATE NOCASE ASC, c.id ASC`,
    );
  }

  listActiveExpense(): Promise<LocalCategoryRow[]> {
    return this.db.getAllAsync<LocalCategoryRow>(
      `SELECT * FROM categories
       WHERE archived = 0 AND transaction_type = 'expense'
       ORDER BY system_category DESC, name COLLATE NOCASE ASC, id ASC`,
    );
  }

  findById(id: string): Promise<LocalCategoryRow | null> {
    return this.db.getFirstAsync<LocalCategoryRow>(
      'SELECT * FROM categories WHERE id = ? LIMIT 1',
      id,
    );
  }

  findByName(
    name: string,
    type: 'expense' | 'income',
  ): Promise<LocalCategoryRow | null> {
    return this.db.getFirstAsync<LocalCategoryRow>(
      `SELECT * FROM categories
       WHERE normalized_name = ? AND transaction_type = ?
       LIMIT 1`,
      name.trim().toLocaleLowerCase(),
      type,
    );
  }

  findActiveByName(
    name: string,
    type: 'expense' | 'income',
  ): Promise<LocalCategoryRow | null> {
    return this.db.getFirstAsync<LocalCategoryRow>(
      `SELECT * FROM categories
       WHERE normalized_name = ? AND transaction_type = ? AND archived = 0
       LIMIT 1`,
      name.trim().toLocaleLowerCase(),
      type,
    );
  }
}
