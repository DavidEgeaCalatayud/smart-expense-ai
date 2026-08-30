import type { SQLiteDatabase } from 'expo-sqlite';

export async function clearLocalAccountData(db: SQLiteDatabase): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync('DELETE FROM sync_conflicts');
    await txn.execAsync('DELETE FROM sync_outbox');
    await txn.execAsync('DELETE FROM transactions');
    await txn.execAsync('DELETE FROM budgets');
    await txn.execAsync('DELETE FROM categories');
    await txn.execAsync('DELETE FROM sync_state');
  });
}
