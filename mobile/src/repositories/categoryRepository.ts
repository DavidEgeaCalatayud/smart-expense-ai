import type { SQLiteDatabase } from 'expo-sqlite';

import type { LocalCategoryRow } from '../database/types';

export interface CategoryRepository {
  listActive(): Promise<LocalCategoryRow[]>;
  findActiveByName(name: string, type: 'expense' | 'income'): Promise<LocalCategoryRow | null>;
}

export class SqliteCategoryRepository implements CategoryRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  listActive(): Promise<LocalCategoryRow[]> {
    return this.db.getAllAsync<LocalCategoryRow>(
      `SELECT * FROM categories WHERE archived = 0 ORDER BY name COLLATE NOCASE ASC, id ASC`,
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
