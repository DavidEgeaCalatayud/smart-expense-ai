import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDatabase } from './migrations';

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await migrateDatabase(db);
  await db.execAsync('PRAGMA foreign_keys = ON');
}
