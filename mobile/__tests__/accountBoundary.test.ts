import type { SQLiteDatabase } from 'expo-sqlite';

import { bindLocalAccount } from '../src/database/accountBoundary';
import { clearLocalAccountDataSafely } from '../src/database/privacyWipe';
import { getSyncState, setSyncState } from '../src/sync/stateRepository';

jest.mock('../src/database/privacyWipe', () => ({
  clearLocalAccountDataSafely: jest.fn(),
}));

jest.mock('../src/sync/stateRepository', () => ({
  getSyncState: jest.fn(),
  setSyncState: jest.fn(),
}));

const mockedClearLocalAccountDataSafely = clearLocalAccountDataSafely as jest.MockedFunction<
  typeof clearLocalAccountDataSafely
>;
const mockedGetSyncState = getSyncState as jest.MockedFunction<typeof getSyncState>;
const mockedSetSyncState = setSyncState as jest.MockedFunction<typeof setSyncState>;

const db = {} as SQLiteDatabase;

describe('local account boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedClearLocalAccountDataSafely.mockResolvedValue(undefined);
    mockedSetSyncState.mockResolvedValue(undefined);
  });

  it('keeps the current replica when the same account is rebound', async () => {
    mockedGetSyncState.mockResolvedValue('account-a');

    await bindLocalAccount(db, 'account-a');

    expect(mockedClearLocalAccountDataSafely).not.toHaveBeenCalled();
    expect(mockedSetSyncState).not.toHaveBeenCalled();
  });

  it('wipes the prior replica before binding a different account', async () => {
    mockedGetSyncState.mockResolvedValue('account-a');
    const order: string[] = [];
    mockedClearLocalAccountDataSafely.mockImplementation(async () => {
      order.push('wipe');
    });
    mockedSetSyncState.mockImplementation(async () => {
      order.push('bind');
    });

    await bindLocalAccount(db, 'account-b');

    expect(mockedClearLocalAccountDataSafely).toHaveBeenCalledWith(db);
    expect(mockedSetSyncState).toHaveBeenCalledWith(db, 'local_account_id', 'account-b');
    expect(order).toEqual(['wipe', 'bind']);
  });

  it('does not bind the new account when the privacy wipe fails', async () => {
    mockedGetSyncState.mockResolvedValue('account-a');
    mockedClearLocalAccountDataSafely.mockRejectedValue(new Error('wipe failed'));

    await expect(bindLocalAccount(db, 'account-b')).rejects.toThrow('wipe failed');

    expect(mockedSetSyncState).not.toHaveBeenCalled();
  });
});
