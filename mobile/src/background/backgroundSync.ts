import * as BackgroundTask from 'expo-background-task';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { getSharedMobileApiClient } from '../api/client';
import { isSessionWorkAllowed, runSessionWork } from '../auth/sessionWork';
import {
  getAccessToken,
  getMobileUser,
  getRefreshToken,
  invalidateMobileSessionAndRequireLocalWipe,
} from '../auth/secureCredentials';
import { bindLocalAccount } from '../database/accountBoundary';
import { DATABASE_NAME } from '../database/constants';
import { initializeDatabase } from '../database/initializeDatabase';
import { runForegroundSync } from '../sync/foregroundSync';
import { SyncClient } from '../sync/syncClient';

export const BACKGROUND_SYNC_TASK_NAME = 'smart-expense-ai-background-sync-v1';
export const BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES = 60;

TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async () => {
  if (!isSessionWorkAllowed()) return BackgroundTask.BackgroundTaskResult.Success;
  try {
    // Register the entire task before its first credential/database await. Otherwise
    // an old account captured during startup could outlive logout's drain barrier.
    return await runSessionWork(async () => {
      const [user, accessToken, refreshToken] = await Promise.all([
        getMobileUser(), getAccessToken(), getRefreshToken(),
      ]);
      if (!user) return BackgroundTask.BackgroundTaskResult.Success;
      if (!accessToken || !refreshToken) {
        await invalidateMobileSessionAndRequireLocalWipe();
        return BackgroundTask.BackgroundTaskResult.Failed;
      }

      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      try {
        await initializeDatabase(db);
        await bindLocalAccount(db, user.id);
        await runForegroundSync(db, new SyncClient(getSharedMobileApiClient()));
        return BackgroundTask.BackgroundTaskResult.Success;
      } finally {
        await db.closeAsync();
      }
    });
  } catch {
    // Never log financial payloads or credentials from headless execution.
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export interface BackgroundSyncRegistrationState {
  available: boolean;
  registered: boolean;
}

export async function getBackgroundSyncRegistrationState(): Promise<BackgroundSyncRegistrationState> {
  const status = await BackgroundTask.getStatusAsync();
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK_NAME);
  return {
    available: status === BackgroundTask.BackgroundTaskStatus.Available,
    registered,
  };
}

export async function registerBackgroundSyncAsync(): Promise<BackgroundSyncRegistrationState> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    return { available: false, registered: false };
  }

  if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK_NAME))) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK_NAME, {
      minimumInterval: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
    });
  }

  return { available: true, registered: true };
}

export async function unregisterBackgroundSyncAsync(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK_NAME)) {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK_NAME);
  }
}
