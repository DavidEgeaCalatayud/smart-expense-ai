import type { SQLiteDatabase } from 'expo-sqlite';

import { runForegroundSync, type ForegroundSyncResult } from './foregroundSync';
import { releaseSyncLease, tryAcquireSyncLease } from './syncLease';
import type { SyncClient } from './syncClient';

export async function runCoordinatedSync(
  db: SQLiteDatabase,
  client: SyncClient,
): Promise<ForegroundSyncResult | null> {
  const lease = await tryAcquireSyncLease(db);
  if (!lease) {
    return null;
  }

  try {
    return await runForegroundSync(db, client);
  } finally {
    await releaseSyncLease(db, lease);
  }
}
