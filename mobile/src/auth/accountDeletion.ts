import type { MobileApiClient } from '../api/client';

export async function deleteMobileAccount(
  api: Pick<MobileApiClient, 'request'>,
  password: string,
  confirmation: string,
  clearDeviceSession: () => Promise<void>,
): Promise<void> {
  if (!password || password.length > 128 || confirmation !== 'DELETE') {
    throw new Error('Enter your current password and type DELETE to confirm.');
  }
  // Never enqueue deletion offline or clear local data after a rejected request.
  // The Bearer session determines the account; no client-provided user ID is sent.
  await api.request<void>('/api/v1/auth/account', {
    method: 'DELETE',
    body: JSON.stringify({ password, confirmation }),
  });
  await clearDeviceSession();
}
