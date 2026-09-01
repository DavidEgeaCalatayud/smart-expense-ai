import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Runs an atomic write on the already-open SQLite connection.
 *
 * SQLCipher keys are connection-scoped. Expo's exclusive transaction helper may acquire another
 * native connection, which has not received this database's PRAGMA key. Keeping BEGIN/COMMIT on
 * the supplied connection preserves both encryption state and atomicity.
 */
export async function runKeyedTransaction<T>(
  db: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await task(db);
    await db.execAsync('COMMIT');
    return result;
  } catch (error) {
    try {
      await db.execAsync('ROLLBACK');
    } catch {
      // Preserve the original operation failure if rollback itself cannot complete.
    }
    throw error;
  }
}
