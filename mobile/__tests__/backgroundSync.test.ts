const mockDefineTask = jest.fn();
const mockIsTaskRegisteredAsync = jest.fn();
const mockGetStatusAsync = jest.fn();
const mockRegisterTaskAsync = jest.fn();
const mockUnregisterTaskAsync = jest.fn();

jest.mock('expo-task-manager', () => ({
  defineTask: mockDefineTask,
  isTaskRegisteredAsync: mockIsTaskRegisteredAsync,
}));

jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Available: 1, Restricted: 2 },
  getStatusAsync: mockGetStatusAsync,
  registerTaskAsync: mockRegisterTaskAsync,
  unregisterTaskAsync: mockUnregisterTaskAsync,
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
