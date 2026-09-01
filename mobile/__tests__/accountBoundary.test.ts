import { clearLocalAccountData } from '../src/database/clearAccountData';
import { bindLocalAccount } from '../src/database/accountBoundary';
import { getSyncState, setSyncState } from '../src/sync/stateRepository';

jest.mock('../src/sync/stateRepository', () => ({
  __esModule: true,
  getSyncState: jest.fn(),
  setSyncState: jest.fn(),
}));

jest.mock('../src/database/clearAccountData', () => ({
  __esModule: true,
  clearLocalAccountData: jest.fn(),
}));

const mockGetSyncState = jest.mocked(getSyncState);
const mockSetSyncState = jest.mocked(setSyncState);
const mockClearLocalAccountData = jest.mocked(clearLocalAccountData);

describe('bindLocalAccount', () => {
  beforeEach(() => {
    mockGetSyncState.mockReset();
    mockSetSyncState.mockReset();
    mockClearLocalAccountData.mockReset();
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
