import type { SQLiteDatabase } from 'expo-sqlite';

import { getSyncState, setSyncState } from '../sync/stateRepository';
import { clearLocalAccountData } from './clearAccountData';

const LOCAL_ACCOUNT_ID_KEY = 'local_account_id';

export async function bindLocalAccount(
  db: SQLiteDatabase,
  accountId: string,
): Promise<void> {
  const currentAccountId = await getSyncState(db, LOCAL_ACCOUNT_ID_KEY);
  if (currentAccountId === accountId) {
    return;
  }

  await clearLocalAccountData(db);
  await setSyncState(db, LOCAL_ACCOUNT_ID_KEY, accountId);
}
