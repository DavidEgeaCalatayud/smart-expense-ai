from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

CATEGORY_ID = "11111111-1111-4111-8111-111111111111"
TRANSACTION_ID = "22222222-2222-4222-8222-222222222222"
PROBE_MERCHANT = "Legacy Migration Probe"
FIXTURE_TIMESTAMP = "2026-08-31T12:00:00.000Z"


def create_fixture(path: Path) -> None:
    path.unlink(missing_ok=True)
    connection = sqlite3.connect(path)
    try:
        connection.executescript(
            """
            CREATE TABLE categories (
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
            );
            CREATE TABLE transactions (
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
            );
            """
        )
        connection.execute(
            """INSERT INTO categories (
                 id, name, normalized_name, transaction_type, system_category, archived,
                 server_version, sync_status, created_at, updated_at
               ) VALUES (?, 'Legacy General', 'legacy general', 'expense', 0, 0, 1, 'synced', ?, ?)""",
            (CATEGORY_ID, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP),
        )
        connection.execute(
            """INSERT INTO transactions (
                 id, merchant, description, category_id, amount_minor, currency,
                 transaction_date, transaction_type, payment_method, is_recurring,
                 source, server_version, sync_status, created_at, updated_at
               ) VALUES (?, ?, '', ?, 1234, 'EUR', '2026-08-31',
                         'expense', 'card', 0, 'manual', 1, 'synced', ?, ?)""",
            (
                TRANSACTION_ID,
                PROBE_MERCHANT,
                CATEGORY_ID,
                FIXTURE_TIMESTAMP,
                FIXTURE_TIMESTAMP,
            ),
        )
        # Deliberately leave the legacy database at version 0. After sqlcipher_export(), the app
        # must apply both current migrations and end at DATABASE_SCHEMA_VERSION=2.
        connection.execute("PRAGMA user_version = 0")
        connection.commit()
    finally:
        connection.close()


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: create-mobile-legacy-fixture.py OUTPUT_PATH")
    create_fixture(Path(sys.argv[1]))


if __name__ == "__main__":
    main()
