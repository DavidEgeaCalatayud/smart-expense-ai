const mockGetSyncState = jest.fn();
const mockSetSyncState = jest.fn();
const mockClearLocalAccountData = jest.fn();

jest.mock('../src/sync/stateRepository', () => ({
  getSyncState: mockGetSyncState,
  setSyncState: mockSetSyncState,
}));

jest.mock('../src/database/clearAccountData', () => ({
  clearLocalAccountData: mockClearLocalAccountData,
}));

import { bindLocalAccount } from '../src/database/accountBoundary';

describe('bindLocalAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the local replica intact when the same account returns', async () => {
    mockGetSyncState.mockResolvedValue('account-a');

    await bindLocalAccount({} as never, 'account-a');

    expect(mockClearLocalAccountData).not.toHaveBeenCalled();
    expect(mockSetSyncState).not.toHaveBeenCalled();
  });

  it('wipes the previous replica before binding a different account', async () => {
    const order: string[] = [];
    mockGetSyncState.mockResolvedValue('account-a');
    mockClearLocalAccountData.mockImplementation(async () => {
      order.push('wipe');
    });
    mockSetSyncState.mockImplementation(async (_db: unknown, key: string, value: string) => {
      order.push(`bind:${key}:${value}`);
    });

    await bindLocalAccount({} as never, 'account-b');

    expect(order).toEqual(['wipe', 'bind:local_account_id:account-b']);
  });

  it('wipes an unbound replica before establishing the first explicit account boundary', async () => {
    mockGetSyncState.mockResolvedValue(null);

    await bindLocalAccount({} as never, 'account-a');

    expect(mockClearLocalAccountData).toHaveBeenCalledTimes(1);
    expect(mockSetSyncState).toHaveBeenCalledWith(expect.anything(), 'local_account_id', 'account-a');
  });
});
