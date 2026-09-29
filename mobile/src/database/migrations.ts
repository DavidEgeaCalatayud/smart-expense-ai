import type { SQLiteDatabase } from 'expo-sqlite';

import { DATABASE_SCHEMA_VERSION } from './constants';

interface Migration {
  version: number;
  statements: readonly string[];
}

const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN ('expense', 'income')),
        system_category INTEGER NOT NULL DEFAULT 0 CHECK (system_category IN (0, 1)),
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        server_version INTEGER,
        sync_status TEXT NOT NULL CHECK (sync_status IN ('synced', 'pending', 'conflict', 'failed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_active_name_type
        ON categories(normalized_name, transaction_type)
        WHERE archived = 0`,
      `CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY NOT NULL,
        merchant TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        currency TEXT NOT NULL CHECK (length(currency) = 3),
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN ('expense', 'income')),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'cash', 'bank_transfer', 'direct_debit')),
        is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0, 1)),
        source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'bank_api')),
        server_version INTEGER,
        sync_status TEXT NOT NULL CHECK (sync_status IN ('synced', 'pending', 'conflict', 'failed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
      )`,
      `CREATE INDEX IF NOT EXISTS ix_transactions_date
        ON transactions(transaction_date DESC, created_at DESC, id DESC)`,
      `CREATE INDEX IF NOT EXISTS ix_transactions_category
        ON transactions(category_id)`,
      `CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY NOT NULL,
        category_id TEXT,
        month TEXT NOT NULL,
        limit_minor INTEGER NOT NULL CHECK (limit_minor > 0),
        server_version INTEGER,
        sync_status TEXT NOT NULL CHECK (sync_status IN ('synced', 'pending', 'conflict', 'failed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_month_scope
        ON budgets(month, COALESCE(category_id, ''))`,
      `CREATE TABLE IF NOT EXISTS sync_outbox (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        mutation_id TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('transaction', 'category', 'budget')),
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
        base_version INTEGER,
        payload_json TEXT,
        client_occurred_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_sync_outbox_status_sequence
        ON sync_outbox(status, sequence)`,
      `CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mutation_id TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('transaction', 'category', 'budget')),
        entity_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        server_version INTEGER,
        server_payload_json TEXT,
        local_payload_json TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS ix_sync_conflicts_unresolved
        ON sync_conflicts(resolved_at, created_at DESC)`,
    ],
  },
  {
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS server_cache (
        cache_key TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS financial_accounts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        institution TEXT,
        account_type TEXT NOT NULL CHECK (account_type IN ('checking', 'savings', 'broker', 'wallet', 'cash', 'other')),
        purpose TEXT NOT NULL CHECK (purpose IN ('daily', 'savings', 'emergency_fund', 'opportunities', 'investment', 'other')),
        current_balance_minor INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
        include_in_net_worth INTEGER NOT NULL DEFAULT 1 CHECK (include_in_net_worth IN (0, 1)),
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        balance_updated_at TEXT NOT NULL,
        server_version INTEGER,
        sync_status TEXT NOT NULL CHECK (sync_status IN ('synced', 'pending', 'conflict', 'failed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_financial_accounts_archived
        ON financial_accounts(archived, created_at, id)`,
      `CREATE TABLE IF NOT EXISTS financial_account_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        financial_account_id TEXT NOT NULL,
        balance_minor INTEGER NOT NULL,
        recorded_at TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('manual', 'open_banking', 'import')),
        pending INTEGER NOT NULL DEFAULT 0 CHECK (pending IN (0, 1)),
        FOREIGN KEY (financial_account_id) REFERENCES financial_accounts(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS ix_financial_account_snapshots_account_recorded
        ON financial_account_snapshots(financial_account_id, recorded_at, id)`,

      `ALTER TABLE sync_outbox RENAME TO sync_outbox_v2`,
      `DROP INDEX IF EXISTS ix_sync_outbox_status_sequence`,
      `CREATE TABLE sync_outbox (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        mutation_id TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('transaction', 'category', 'budget', 'financial_account')),
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
        base_version INTEGER,
        payload_json TEXT,
        client_occurred_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `INSERT INTO sync_outbox (
         sequence, mutation_id, entity_type, entity_id, operation, base_version,
         payload_json, client_occurred_at, status, attempt_count, last_error, created_at, updated_at
       ) SELECT
         sequence, mutation_id, entity_type, entity_id, operation, base_version,
         payload_json, client_occurred_at, status, attempt_count, last_error, created_at, updated_at
       FROM sync_outbox_v2`,
      `DROP TABLE sync_outbox_v2`,
      `CREATE INDEX IF NOT EXISTS ix_sync_outbox_status_sequence
        ON sync_outbox(status, sequence)`,

      `ALTER TABLE sync_conflicts RENAME TO sync_conflicts_v2`,
      `DROP INDEX IF EXISTS ix_sync_conflicts_unresolved`,
      `CREATE TABLE sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mutation_id TEXT NOT NULL UNIQUE,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('transaction', 'category', 'budget', 'financial_account')),
        entity_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        server_version INTEGER,
        server_payload_json TEXT,
        local_payload_json TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      )`,
      `INSERT INTO sync_conflicts (
         id, mutation_id, entity_type, entity_id, reason, server_version,
         server_payload_json, local_payload_json, created_at, resolved_at
       ) SELECT
         id, mutation_id, entity_type, entity_id, reason, server_version,
         server_payload_json, local_payload_json, created_at, resolved_at
       FROM sync_conflicts_v2`,
      `DROP TABLE sync_conflicts_v2`,
      `CREATE INDEX IF NOT EXISTS ix_sync_conflicts_unresolved
        ON sync_conflicts(resolved_at, created_at DESC)`,
    ],
  },
  {
    version: 4,
    statements: [
      `ALTER TABLE financial_account_snapshots
        ADD COLUMN include_in_net_worth INTEGER NOT NULL DEFAULT 1
        CHECK (include_in_net_worth IN (0, 1))`,
      `ALTER TABLE financial_account_snapshots
        ADD COLUMN archived INTEGER NOT NULL DEFAULT 0
        CHECK (archived IN (0, 1))`,
      `UPDATE financial_account_snapshots
       SET include_in_net_worth = COALESCE((
             SELECT a.include_in_net_worth
             FROM financial_accounts a
             WHERE a.id = financial_account_snapshots.financial_account_id
           ), 1),
           archived = COALESCE((
             SELECT a.archived
             FROM financial_accounts a
             WHERE a.id = financial_account_snapshots.financial_account_id
           ), 0)`,
    ],
  },
];

async function runMigrationTransaction(
  db: SQLiteDatabase,
  task: () => Promise<void>,
): Promise<void> {
  // SQLCipher keys are scoped to a SQLite connection. Expo's
  // withExclusiveTransactionAsync() opens a second native connection, which would be unkeyed and
  // therefore cannot read this encrypted database. Keep migrations on the already-keyed connection
  // and acquire the write reservation explicitly before applying any schema change.
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    await task();
    await db.execAsync('COMMIT');
  } catch (error) {
    try {
      await db.execAsync('ROLLBACK');
    } catch {
      // Preserve the original migration failure if rollback itself cannot complete.
    }
    throw error;
  }
}

export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON');
  await db.execAsync('PRAGMA journal_mode = WAL');

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion > DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `Database schema ${currentVersion} is newer than supported schema ${DATABASE_SCHEMA_VERSION}`,
    );
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    await runMigrationTransaction(db, async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
    currentVersion = migration.version;
  }

  if (currentVersion !== DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `Database migration stopped at ${currentVersion}; expected ${DATABASE_SCHEMA_VERSION}`,
    );
  }
}
