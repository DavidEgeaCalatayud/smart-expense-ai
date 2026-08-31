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
];

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

    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const statement of migration.statements) {
        await txn.execAsync(statement);
      }
      await txn.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
    currentVersion = migration.version;
  }

  if (currentVersion !== DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `Database migration stopped at ${currentVersion}; expected ${DATABASE_SCHEMA_VERSION}`,
    );
  }
}
