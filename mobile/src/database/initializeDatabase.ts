import type { SQLiteDatabase } from 'expo-sqlite';

import { getOrCreateDatabaseKey } from './databaseKey';
import { migrateDatabase } from './migrations';

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  const databaseKey = await getOrCreateDatabaseKey();
  await db.execAsync(`PRAGMA key = '${databaseKey}'`);
  await migrateDatabase(db);
  await db.execAsync('PRAGMA foreign_keys = ON');
}
