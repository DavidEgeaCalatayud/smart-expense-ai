const defineTask = jest.fn();
const isTaskRegisteredAsync = jest.fn();
const getStatusAsync = jest.fn();
const registerTaskAsync = jest.fn();
const unregisterTaskAsync = jest.fn();

jest.mock('expo-task-manager', () => ({
  defineTask,
  isTaskRegisteredAsync,
}));

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Available: 1, Restricted: 2 },
  getStatusAsync,
  registerTaskAsync,
  unregisterTaskAsync,
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  defaultDatabaseDirectory: '/tmp/sqlite',
  deleteDatabaseAsync: jest.fn(),
}));

import * as BackgroundTask from 'expo-background-task';
import {
  BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
  BACKGROUND_SYNC_TASK_NAME,
  registerBackgroundSyncAsync,
  unregisterBackgroundSyncAsync,
} from '../src/background/backgroundSync';

describe('background sync scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defines the headless task in global module scope', () => {
    expect(defineTask).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK_NAME, expect.any(Function));
  });

  it('registers one best-effort task with a safe interval when Android allows it', async () => {
    getStatusAsync.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Available);
    isTaskRegisteredAsync.mockResolvedValue(false);

    await expect(registerBackgroundSyncAsync()).resolves.toEqual({
      available: true,
      registered: true,
    });

    expect(BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES).toBeGreaterThanOrEqual(15);
    expect(registerTaskAsync).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK_NAME, {
      minimumInterval: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
    });
  });

  it('does not pretend background sync is registered when the scheduler is restricted', async () => {
    getStatusAsync.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Restricted);

    await expect(registerBackgroundSyncAsync()).resolves.toEqual({
      available: false,
      registered: false,
    });
    expect(registerTaskAsync).not.toHaveBeenCalled();
  });

  it('unregisters only an existing background task', async () => {
    isTaskRegisteredAsync.mockResolvedValue(true);

    await unregisterBackgroundSyncAsync();

    expect(unregisterTaskAsync).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK_NAME);
  });
});
