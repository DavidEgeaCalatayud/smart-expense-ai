import { changePasswordSession } from '../src/auth/changePasswordSession';
import { clearLocalAccountData } from '../src/database/clearAccountData';
import { getSyncHealth } from '../src/sync/statusRepository';
import { loginMobileSession } from '../src/auth/sessionManager';
import { invalidateMobileSessionAndRequireLocalWipe } from '../src/auth/secureCredentials';
import { isSessionWorkAllowed, resumeSessionWork, runSessionWork } from '../src/auth/sessionWork';

jest.mock('../src/database/clearAccountData', () => ({ clearLocalAccountData: jest.fn(async () => undefined) }));
jest.mock('../src/sync/statusRepository', () => ({ getSyncHealth: jest.fn() }));
jest.mock('../src/auth/sessionManager', () => ({ loginMobileSession: jest.fn() }));
jest.mock('../src/auth/secureCredentials', () => ({ acknowledgeLocalWipeRequirement: jest.fn(async () => undefined), invalidateMobileSessionAndRequireLocalWipe: jest.fn(async () => undefined) }));
const user = { id: 'owner', email: 'owner@example.test', displayName: 'Owner' };
beforeEach(() => { jest.clearAllMocks(); resumeSessionWork(); jest.mocked(getSyncHealth).mockResolvedValue({ queued: 0, sending: 0, failed: 0, conflicts: 0 }); jest.mocked(loginMobileSession).mockResolvedValue(user); });
afterEach(resumeSessionWork);
it('drains account work before revocation, then replaces credentials without wiping synchronized data', async () => {
  let release!: () => void;
  const work = runSessionWork(() => new Promise<void>((done) => { release = done; }));
  await Promise.resolve();
  const api = { request: jest.fn(async () => undefined) };
  const setUser = jest.fn();
  const change = changePasswordSession({} as never, api as never, {} as never, user, 'old', 'new-long-password', setUser);
  await Promise.resolve(); expect(api.request).not.toHaveBeenCalled();
  release(); await work; await change;
  expect(setUser).toHaveBeenCalledWith(user);
  expect(clearLocalAccountData).not.toHaveBeenCalled();
  expect(isSessionWorkAllowed()).toBe(true);
});
it('protects unsent local changes by refusing password revocation until they sync', async () => {
  jest.mocked(getSyncHealth).mockResolvedValue({ queued: 1, sending: 0, failed: 0, conflicts: 0 });
  const api = { request: jest.fn() };
  await expect(changePasswordSession({} as never, api as never, {} as never, user, 'old', 'new', jest.fn())).rejects.toThrow('pending changes');
  expect(api.request).not.toHaveBeenCalled(); expect(clearLocalAccountData).not.toHaveBeenCalled(); expect(isSessionWorkAllowed()).toBe(true);
});
it('requires fresh sign-in if the password changed but replacement authentication fails', async () => {
  jest.mocked(loginMobileSession).mockRejectedValue(new Error('network unavailable'));
  const setUser = jest.fn();
  await expect(changePasswordSession({} as never, { request: jest.fn(async () => undefined) } as never, {} as never, user, 'old', 'new', setUser)).rejects.toThrow('Password changed');
  expect(invalidateMobileSessionAndRequireLocalWipe).toHaveBeenCalled(); expect(clearLocalAccountData).toHaveBeenCalled(); expect(setUser).toHaveBeenCalledWith(null); expect(isSessionWorkAllowed()).toBe(false);
});
