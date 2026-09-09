import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Runs an atomic write on the already-open SQLite connection.
 *
 * SQLCipher keys are connection-scoped. Expo's exclusive transaction helper may acquire another
 * native connection, which has not received this database's PRAGMA key. Keeping BEGIN/COMMIT on
 * the supplied connection preserves both encryption state and atomicity.
 */
async function executeTransaction<T>(
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

const transactionTails = new WeakMap<SQLiteDatabase, Promise<unknown>>();

export function runKeyedTransaction<T>(
  db: SQLiteDatabase,
  task: (transaction: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const previous = transactionTails.get(db) ?? Promise.resolve();
  const result = previous.then(() => executeTransaction(db, task));
  const tail = result.catch(() => undefined);
  transactionTails.set(db, tail);
  void tail.then(() => {
    if (transactionTails.get(db) === tail) transactionTails.delete(db);
  });
  return result;
}
