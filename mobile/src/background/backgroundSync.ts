import * as BackgroundTask from 'expo-background-task';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

import { MobileApiClient } from '../api/client';
import { getMobileApiBaseUrl } from '../api/config';
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
  const [user, accessToken, refreshToken] = await Promise.all([
    getMobileUser(),
    getAccessToken(),
    getRefreshToken(),
  ]);

  if (!user) {
    return BackgroundTask.BackgroundTaskResult.Success;
  }

  if (!accessToken || !refreshToken) {
    await invalidateMobileSessionAndRequireLocalWipe();
    return BackgroundTask.BackgroundTaskResult.Failed;
  }

  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  try {
    await initializeDatabase(db);
    await bindLocalAccount(db, user.id);
    const apiClient = new MobileApiClient(getMobileApiBaseUrl());
    await runForegroundSync(db, new SyncClient(apiClient));
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // The foreground path remains authoritative. Do not log financial payloads or tokens from a
    // headless execution; Android/Expo may retain logs outside the app sandbox.
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    await db.closeAsync();
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
