import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as credentials from '../src/auth/secureCredentials';
import { pauseAndDrainSessionWork, resumeSessionWork } from '../src/auth/sessionWork';

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
  afterEach(() => { jest.restoreAllMocks(); resumeSessionWork(); });

  it('drains a headless task even while its initial credential lookup is still pending', async () => {
    let release!: (user: null) => void;
    const lookup = new Promise<null>((resolve) => { release = resolve; });
    jest.spyOn(credentials, 'getMobileUser').mockReturnValue(lookup);
    jest.spyOn(credentials, 'getAccessToken').mockResolvedValue('test-access');
    jest.spyOn(credentials, 'getRefreshToken').mockResolvedValue('test-refresh');
    const task = mockDefineTask.mock.calls[0]![1] as () => Promise<unknown>;
    const running = task();
    await Promise.resolve();
    let drained = false;
    const closing = pauseAndDrainSessionWork().then(() => { drained = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(drained).toBe(false);
    release(null);
    await Promise.all([running, closing]);
    expect(drained).toBe(true);
  });

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
