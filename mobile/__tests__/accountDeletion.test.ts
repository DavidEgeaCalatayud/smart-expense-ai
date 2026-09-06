import { deleteMobileAccount } from '../src/auth/accountDeletion';

describe('account deletion', () => {
  it('requires exact confirmation before any remote deletion or local wipe', async () => {
    const request = jest.fn();
    const wipe = jest.fn();
    for (const [password, confirmation] of [['', 'DELETE'], ['password', 'delete'], ['password', ' DELETE']]) {
      await expect(deleteMobileAccount({ request }, password!, confirmation!, wipe)).rejects.toThrow('current password');
    }
    expect(request).not.toHaveBeenCalled();
    expect(wipe).not.toHaveBeenCalled();
  });

  it('preserves the device session and data when the server rejects or is unreachable', async () => {
    const wipe = jest.fn();
    const request = jest.fn().mockRejectedValue(new Error('Current password is incorrect'));
    await expect(deleteMobileAccount({ request }, 'wrong-password', 'DELETE', wipe)).rejects.toThrow('incorrect');
    expect(wipe).not.toHaveBeenCalled();
  });

  it('cleans up only after the server acknowledges deletion of the authenticated account', async () => {
    const events: string[] = [];
    const request = jest.fn().mockImplementation(async () => { events.push('server-deleted'); });
    const wipe = jest.fn(async () => { events.push('device-cleared'); });
    await deleteMobileAccount({ request }, 'current-password', 'DELETE', wipe);
    expect(request).toHaveBeenCalledWith('/api/v1/auth/account', {
      method: 'DELETE', body: JSON.stringify({ password: 'current-password', confirmation: 'DELETE' }),
    });
    expect(events).toEqual(['server-deleted', 'device-cleared']);
  });
});
