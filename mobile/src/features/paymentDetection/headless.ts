import { AppRegistry } from 'react-native';
import * as SQLite from 'expo-sqlite';

import { getMobileUser } from '../../auth/secureCredentials';
import { isSessionWorkAllowed, runSessionWork } from '../../auth/sessionWork';
import { bindLocalAccount } from '../../database/accountBoundary';
import { DATABASE_NAME } from '../../database/constants';
import { initializeDatabase } from '../../database/initializeDatabase';
import { processNativePaymentCandidate } from './engine';
import {
  acknowledgePaymentNotificationCandidate,
  parseNativePaymentNotificationCandidate,
} from './nativePaymentNotifications';

export const PAYMENT_DETECTION_HEADLESS_TASK = 'SmartExpensePaymentDetection';

interface HeadlessPaymentData {
  candidateJson?: string;
}

AppRegistry.registerHeadlessTask(PAYMENT_DETECTION_HEADLESS_TASK, () => async (data: HeadlessPaymentData) => {
  if (!data.candidateJson) return;
  let raw: unknown;
  try {
    raw = JSON.parse(data.candidateJson);
  } catch {
    return;
  }
  const candidate = parseNativePaymentNotificationCandidate(raw);
  if (!candidate) return;

  if (!isSessionWorkAllowed()) return;
  await runSessionWork(async () => {
    const user = await getMobileUser();
    if (!user) {
      // Never carry a financial notification across accounts or a logged-out session.
      await acknowledgePaymentNotificationCandidate(candidate.notificationKey).catch(() => undefined);
      return;
    }
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    try {
      await initializeDatabase(db);
      await bindLocalAccount(db, user.id);
      await processNativePaymentCandidate(db, candidate);
    } finally {
      await db.closeAsync();
    }
  });
});
