jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: jest.fn(),
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import {
  BACKGROUND_SYNC_TASK,
  ensureBackgroundSyncRegistered,
  unregisterBackgroundSync,
} from '../src/sync/backgroundSync';

const getStatusAsync = BackgroundTask.getStatusAsync as jest.MockedFunction<
  typeof BackgroundTask.getStatusAsync
>;
const registerTaskAsync = BackgroundTask.registerTaskAsync as jest.MockedFunction<
  typeof BackgroundTask.registerTaskAsync
>;
const unregisterTaskAsync = BackgroundTask.unregisterTaskAsync as jest.MockedFunction<
  typeof BackgroundTask.unregisterTaskAsync
>;
const isTaskRegisteredAsync = TaskManager.isTaskRegisteredAsync as jest.MockedFunction<
  typeof TaskManager.isTaskRegisteredAsync
>;

describe('background synchronization registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the minimum Android WorkManager interval when available', async () => {
    getStatusAsync.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Available);
    isTaskRegisteredAsync.mockResolvedValue(false);

    await ensureBackgroundSyncRegistered();

    expect(registerTaskAsync).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15,
    });
  });

  it('does not register when background execution is restricted', async () => {
    getStatusAsync.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Restricted);

    await ensureBackgroundSyncRegistered();

    expect(isTaskRegisteredAsync).not.toHaveBeenCalled();
    expect(registerTaskAsync).not.toHaveBeenCalled();
  });

  it('unregisters only when the task is currently registered', async () => {
    isTaskRegisteredAsync.mockResolvedValue(true);

    await unregisterBackgroundSync();

    expect(unregisterTaskAsync).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK);
  });
});
