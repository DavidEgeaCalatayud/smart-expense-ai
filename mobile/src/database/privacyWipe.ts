import type { SQLiteDatabase } from 'expo-sqlite';

import { acquireSyncLease, releaseSyncLease } from '../sync/syncLease';
import { clearLocalAccountData } from './clearAccountData';

const PRIVACY_WIPE_SYNC_WAIT_MS = 30_000;

export async function clearLocalAccountDataSafely(db: SQLiteDatabase): Promise<void> {
  const lease = await acquireSyncLease(db, PRIVACY_WIPE_SYNC_WAIT_MS);
  try {
    await clearLocalAccountData(db);
  } finally {
    await releaseSyncLease(db, lease);
  }
}
