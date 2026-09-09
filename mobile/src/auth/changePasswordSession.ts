import type { SQLiteDatabase } from 'expo-sqlite';
import type { MobileApiClient } from '../api/client';
import { clearLocalAccountData } from '../database/clearAccountData';
import { getSyncHealth } from '../sync/statusRepository';
import type { MobileAuthClient } from './mobileAuthClient';
import { loginMobileSession } from './sessionManager';
import { acknowledgeLocalWipeRequirement, invalidateMobileSessionAndRequireLocalWipe, type MobileAuthUser } from './secureCredentials';
import { pauseAndDrainSessionWork, resumeSessionWork } from './sessionWork';

export async function changePasswordSession(db: SQLiteDatabase, api: MobileApiClient, client: MobileAuthClient,
  user: MobileAuthUser, currentPassword: string, newPassword: string, setUser: (user: MobileAuthUser | null) => void,
): Promise<void> {
  let changed = false;
  let authenticated = false;
  try {
    // Changing a password revokes all sessions. Drain every account task and ensure
    // no financial edits can be stranded if replacement authentication fails.
    await pauseAndDrainSessionWork();
    const health = await getSyncHealth(db);
    if (health.queued + health.sending + health.failed + health.conflicts > 0) {
      throw new Error('Sync your pending changes and resolve conflicts before changing your password.');
    }
    await api.request('/api/v2/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });
    changed = true;
    const refreshed = await loginMobileSession(client, user.email, newPassword);
    setUser(refreshed);
    authenticated = true;
  } catch (caught) {
    if (changed) {
      await invalidateMobileSessionAndRequireLocalWipe();
      await clearLocalAccountData(db);
      await acknowledgeLocalWipeRequirement();
      setUser(null);
      throw new Error('Password changed. Sign in again with your new password.');
    }
    throw caught;
  } finally {
    if (!changed || authenticated) resumeSessionWork();
  }
}
