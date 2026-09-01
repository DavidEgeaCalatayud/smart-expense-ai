import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import {
  BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
  BACKGROUND_SYNC_TASK_NAME,
  registerBackgroundSyncAsync,
  unregisterBackgroundSyncAsync,
} from '../src/background/backgroundSync';

jest.mock('expo-task-manager', () => ({
  __esModule: true,
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

jest.mock('expo-background-task', () => ({
  __esModule: true,
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: jest.fn(),
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({
  __esModule: true,
  openDatabaseAsync: jest.fn(),
  defaultDatabaseDirectory: '/tmp/sqlite',
  deleteDatabaseAsync: jest.fn(),
}));

const mockDefineTask = jest.mocked(TaskManager.defineTask);
const mockIsTaskRegisteredAsync = jest.mocked(TaskManager.isTaskRegisteredAsync);
const mockGetStatusAsync = jest.mocked(BackgroundTask.getStatusAsync);
const mockRegisterTaskAsync = jest.mocked(BackgroundTask.registerTaskAsync);
const mockUnregisterTaskAsync = jest.mocked(BackgroundTask.unregisterTaskAsync);

describe('background sync scheduler', () => {
  beforeEach(() => {
    mockIsTaskRegisteredAsync.mockReset();
    mockGetStatusAsync.mockReset();
    mockRegisterTaskAsync.mockReset();
    mockUnregisterTaskAsync.mockReset();
  });

  it('defines the headless task in global module scope', () => {
    expect(mockDefineTask).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK_NAME, expect.any(Function));
  });

  it('registers one best-effort task with a safe interval when Android allows it', async () => {
    mockGetStatusAsync.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Available);
    mockIsTaskRegisteredAsync.mockResolvedValue(false);

    await expect(registerBackgroundSyncAsync()).resolves.toEqual({
      available: true,
      registered: true,
    });

    expect(BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES).toBeGreaterThanOrEqual(15);
    expect(mockRegisterTaskAsync).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK_NAME, {
      minimumInterval: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
    });
  });

  it('does not pretend background sync is registered when the scheduler is restricted', async () => {
    mockGetStatusAsync.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Restricted);

    await expect(registerBackgroundSyncAsync()).resolves.toEqual({
      available: false,
      registered: false,
    });
    expect(mockRegisterTaskAsync).not.toHaveBeenCalled();
  });

  it('unregisters only an existing background task', async () => {
    mockIsTaskRegisteredAsync.mockResolvedValue(true);

    await unregisterBackgroundSyncAsync();

    expect(mockUnregisterTaskAsync).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK_NAME);
  });
});
