import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../../database/keyedTransaction';

export async function ensurePaymentDetectionSchema(db: SQLiteDatabase): Promise<void> {
  await runKeyedTransaction(db, async (txn) => {
    await txn.execAsync(`
      CREATE TABLE IF NOT EXISTS payment_detection_settings (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        mode TEXT NOT NULL DEFAULT 'confirm' CHECK (mode IN ('notify', 'confirm', 'automatic')),
        auto_confidence REAL NOT NULL DEFAULT 0.85 CHECK (auto_confidence >= 0 AND auto_confidence <= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_account_links (
        id TEXT PRIMARY KEY NOT NULL,
        source_package TEXT NOT NULL,
        card_hint TEXT NOT NULL DEFAULT '',
        financial_account_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (financial_account_id) REFERENCES financial_accounts(id) ON DELETE CASCADE,
        UNIQUE(source_package, card_hint)
      );
      CREATE INDEX IF NOT EXISTS ix_payment_account_links_account
        ON payment_account_links(financial_account_id);

      CREATE TABLE IF NOT EXISTS observed_payment_events (
        id TEXT PRIMARY KEY NOT NULL,
        source_package TEXT NOT NULL,
        source_label TEXT NOT NULL,
        notification_key TEXT NOT NULL UNIQUE,
        notification_id INTEGER,
        occurred_at TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        merchant TEXT,
        amount_minor INTEGER,
        currency TEXT,
        card_hint TEXT,
        event_kind TEXT NOT NULL CHECK (event_kind IN (
          'payment', 'refund', 'transfer_in', 'transfer_out', 'rejected', 'hold', 'unknown'
        )),
        financial_account_id TEXT,
        transaction_id TEXT,
        confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
        status TEXT NOT NULL CHECK (status IN (
          'pending', 'needs_confirmation', 'balance_pending', 'applied', 'ignored', 'duplicate', 'rejected', 'failed'
        )),
        fingerprint TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (financial_account_id) REFERENCES financial_accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS ix_observed_payment_events_status_time
        ON observed_payment_events(status, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS ix_observed_payment_events_amount_time
        ON observed_payment_events(amount_minor, currency, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS ix_observed_payment_events_account
        ON observed_payment_events(financial_account_id, occurred_at DESC);
    `);

    const now = new Date().toISOString();
    await txn.runAsync(
      `INSERT OR IGNORE INTO payment_detection_settings (
         id, enabled, mode, auto_confidence, created_at, updated_at
       ) VALUES (1, 0, 'confirm', 0.85, ?, ?)`,
      now,
      now,
    );
  });
}
