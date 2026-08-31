import type { SQLiteDatabase } from 'expo-sqlite';

import { SYNC_LEASE_STATE_KEY } from '../sync/syncLease';

export async function clearLocalAccountData(db: SQLiteDatabase): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync('DELETE FROM server_cache');
    await txn.execAsync('DELETE FROM sync_conflicts');
    await txn.execAsync('DELETE FROM sync_outbox');
    await txn.execAsync('DELETE FROM transactions');
    await txn.execAsync('DELETE FROM budgets');
    await txn.execAsync('DELETE FROM categories');
    // Keep the active runtime lease until WAL truncation/VACUUM completes. The
    // caller releases that exact lease afterwards, preventing a new sync from
    // entering during the post-transaction privacy cleanup.
    await txn.runAsync(
      'DELETE FROM sync_state WHERE key <> ?',
      SYNC_LEASE_STATE_KEY,
    );
  });

  // Ensure stale WAL pages are not retained after a privacy-boundary wipe.
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
  await db.execAsync('VACUUM');
}
