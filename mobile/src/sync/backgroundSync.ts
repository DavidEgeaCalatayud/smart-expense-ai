import * as BackgroundTask from 'expo-background-task';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { MobileApiClient } from '../api/client';
import { getMobileApiBaseUrl } from '../api/config';
import { getMobileUser, getRefreshToken } from '../auth/secureCredentials';
import { DATABASE_NAME } from '../database/constants';
import { initializeDatabase } from '../database/initializeDatabase';
import { runCoordinatedSync } from './coordinatedSync';
import { SyncClient } from './syncClient';

export const BACKGROUND_SYNC_TASK = 'smart-expense-ai.background-sync-v1';
const BACKGROUND_SYNC_INTERVAL_MINUTES = 15;

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  const [user, refreshToken] = await Promise.all([getMobileUser(), getRefreshToken()]);
  if (!user || !refreshToken) {
    return BackgroundTask.BackgroundTaskResult.Success;
  }

  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  try {
    await initializeDatabase(db);
    const client = new SyncClient(new MobileApiClient(getMobileApiBaseUrl()));
    await runCoordinatedSync(db, client);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    await db.closeAsync();
  }
});

export async function ensureBackgroundSyncRegistered(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    return;
  }
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
    return;
  }
  await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, {
    minimumInterval: BACKGROUND_SYNC_INTERVAL_MINUTES,
  });
}

export async function unregisterBackgroundSync(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
  }
}
