import type { SQLiteDatabase } from 'expo-sqlite';

import { acquireSyncLease, releaseSyncLease } from '../sync/syncLease';
import { clearLocalAccountData } from './clearAccountData';

const PRIVACY_WIPE_SYNC_WAIT_MS = 30_000;

export async function clearLocalAccountDataSafely(
  db: SQLiteDatabase,
  beforeLeaseRelease?: () => Promise<void>,
): Promise<void> {
  const lease = await acquireSyncLease(db, PRIVACY_WIPE_SYNC_WAIT_MS);
  try {
    await clearLocalAccountData(db);
    // Logout uses this hook to clear/revoke mobile credentials while the sync
    // lease is still held. A queued background task therefore cannot repopulate
    // the freshly wiped database using credentials from the outgoing account.
    await beforeLeaseRelease?.();
  } finally {
    await releaseSyncLease(db, lease);
  }
}
