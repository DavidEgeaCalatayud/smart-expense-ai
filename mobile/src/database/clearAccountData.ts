import type { SQLiteDatabase } from 'expo-sqlite';

import { setNativePaymentCaptureEnabled } from '../features/paymentDetection/nativePaymentNotifications';
import { clearFinancialNotifications } from '../notifications/nativeNotifications';
import { runKeyedTransaction } from './keyedTransaction';

export async function clearLocalAccountData(db: SQLiteDatabase): Promise<void> {
  await clearFinancialNotifications().catch(() => undefined);
  await setNativePaymentCaptureEnabled(false).catch(() => undefined);
  await runKeyedTransaction(db, async (txn) => {
    await txn.execAsync('DELETE FROM server_cache');
    await txn.execAsync('DELETE FROM sync_conflicts');
    await txn.execAsync('DELETE FROM sync_outbox');
    await txn.execAsync('DELETE FROM observed_payment_events');
    await txn.execAsync('DELETE FROM payment_account_links');
    await txn.execAsync('DELETE FROM transactions');
    await txn.execAsync('DELETE FROM budgets');
    await txn.execAsync('DELETE FROM financial_account_snapshots');
    await txn.execAsync('DELETE FROM financial_accounts');
    await txn.execAsync('DELETE FROM categories');
    await txn.execAsync('DELETE FROM sync_state');
    await txn.execAsync("UPDATE payment_detection_settings SET enabled = 0, mode = 'confirm', auto_confidence = 0.85, updated_at = datetime('now') WHERE id = 1");
  });
}
