const getSyncState = jest.fn();
const setSyncState = jest.fn();
const clearLocalAccountData = jest.fn();

jest.mock('../src/sync/stateRepository', () => ({
  getSyncState,
  setSyncState,
}));

jest.mock('../src/database/clearAccountData', () => ({
  clearLocalAccountData,
}));

import { bindLocalAccount } from '../src/database/accountBoundary';

describe('bindLocalAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the local replica intact when the same account returns', async () => {
    getSyncState.mockResolvedValue('account-a');

    await bindLocalAccount({} as never, 'account-a');

    expect(clearLocalAccountData).not.toHaveBeenCalled();
    expect(setSyncState).not.toHaveBeenCalled();
  });

  it('wipes the previous replica before binding a different account', async () => {
    const order: string[] = [];
    getSyncState.mockResolvedValue('account-a');
    clearLocalAccountData.mockImplementation(async () => {
      order.push('wipe');
    });
    setSyncState.mockImplementation(async (_db: unknown, key: string, value: string) => {
      order.push(`bind:${key}:${value}`);
    });

    await bindLocalAccount({} as never, 'account-b');

    expect(order).toEqual(['wipe', 'bind:local_account_id:account-b']);
  });

  it('wipes an unbound replica before establishing the first explicit account boundary', async () => {
    getSyncState.mockResolvedValue(null);

    await bindLocalAccount({} as never, 'account-a');

    expect(clearLocalAccountData).toHaveBeenCalledTimes(1);
    expect(setSyncState).toHaveBeenCalledWith(expect.anything(), 'local_account_id', 'account-a');
  });
});
