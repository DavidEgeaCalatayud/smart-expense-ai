import type { SyncChange } from '@smart-expense-ai/api-contracts';
import { decimalToMinorUnits } from '@smart-expense-ai/domain-types';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../database/keyedTransaction';
import type { LocalSyncStatus } from '../database/types';

interface ExistingSyncRow {
  sync_status: LocalSyncStatus;
}

type SqlTxn = SQLiteDatabase;
type MutableLocalTable = 'transactions' | 'categories' | 'budgets' | 'financial_accounts';

function normalizeCategoryName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

async function hasUnsyncedLocalIntent(
  db: SqlTxn,
  table: MutableLocalTable,
  entityId: string,
): Promise<boolean> {
  const row = await db.getFirstAsync<ExistingSyncRow>(
    `SELECT sync_status FROM ${table} WHERE id = ? LIMIT 1`,
    entityId,
  );
  return row !== null && row.sync_status !== 'synced';
}

async function applyCategoryChange(
  db: SqlTxn,
  change: SyncChange,
  force: boolean,
): Promise<void> {
  if (change.entityType !== 'category') return;
  if (!force && (await hasUnsyncedLocalIntent(db, 'categories', change.entityId))) return;
  if (change.operation === 'delete') {
    await db.runAsync('DELETE FROM categories WHERE id = ?', change.entityId);
    return;
  }

  const payload = change.payload;
  await db.runAsync(
    `INSERT INTO categories (
       id, name, normalized_name, transaction_type, system_category, archived,
       server_version, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       normalized_name = excluded.normalized_name,
       transaction_type = excluded.transaction_type,
       system_category = excluded.system_category,
       archived = excluded.archived,
       server_version = excluded.server_version,
       sync_status = 'synced',
       updated_at = excluded.updated_at`,
    change.entityId,
    payload.name,
    normalizeCategoryName(payload.name),
    payload.transactionType,
    payload.systemCategory ? 1 : 0,
    payload.archived ? 1 : 0,
    change.version,
    change.changedAt,
    change.changedAt,
  );
}

async function applyTransactionChange(
  db: SqlTxn,
  change: SyncChange,
  force: boolean,
): Promise<void> {
  if (change.entityType !== 'transaction') return;
  if (!force && (await hasUnsyncedLocalIntent(db, 'transactions', change.entityId))) return;
  if (change.operation === 'delete') {
    await db.runAsync('DELETE FROM transactions WHERE id = ?', change.entityId);
    return;
  }

  const payload = change.payload;
  await db.runAsync(
    `INSERT INTO transactions (
       id, merchant, description, category_id, amount_minor, currency,
       transaction_date, transaction_type, payment_method, is_recurring,
       source, server_version, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       merchant = excluded.merchant,
       description = excluded.description,
       category_id = excluded.category_id,
       amount_minor = excluded.amount_minor,
       currency = excluded.currency,
       transaction_date = excluded.transaction_date,
       transaction_type = excluded.transaction_type,
       payment_method = excluded.payment_method,
       is_recurring = excluded.is_recurring,
       source = excluded.source,
       server_version = excluded.server_version,
       sync_status = 'synced',
       updated_at = excluded.updated_at`,
    change.entityId,
    payload.merchant,
    payload.description,
    payload.categoryId,
    decimalToMinorUnits(payload.amount),
    payload.currency,
    payload.transactionDate,
    payload.transactionType,
    payload.paymentMethod,
    payload.isRecurring ? 1 : 0,
    payload.source,
    change.version,
    change.changedAt,
    change.changedAt,
  );
}

async function applyBudgetChange(
  db: SqlTxn,
  change: SyncChange,
  force: boolean,
): Promise<void> {
  if (change.entityType !== 'budget') return;
  if (!force && (await hasUnsyncedLocalIntent(db, 'budgets', change.entityId))) return;
  if (change.operation === 'delete') {
    await db.runAsync('DELETE FROM budgets WHERE id = ?', change.entityId);
    return;
  }

  const payload = change.payload;
  await db.runAsync(
    `INSERT INTO budgets (
       id, category_id, month, limit_minor, server_version,
       sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'synced', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       category_id = excluded.category_id,
       month = excluded.month,
       limit_minor = excluded.limit_minor,
       server_version = excluded.server_version,
       sync_status = 'synced',
       updated_at = excluded.updated_at`,
    change.entityId,
    payload.categoryId,
    payload.month.slice(0, 7),
    decimalToMinorUnits(payload.limitAmount),
    change.version,
    change.changedAt,
    change.changedAt,
  );
}

async function applyFinancialAccountChange(
  db: SqlTxn,
  change: SyncChange,
  force: boolean,
): Promise<void> {
  if (change.entityType !== 'financial_account') return;
  if (!force && (await hasUnsyncedLocalIntent(db, 'financial_accounts', change.entityId))) return;
  if (change.operation === 'delete') {
    await db.runAsync('DELETE FROM financial_accounts WHERE id = ?', change.entityId);
    return;
  }

  const payload = change.payload;
  await db.runAsync(
    `INSERT INTO financial_accounts (
       id, name, institution, account_type, purpose, current_balance_minor,
       currency, include_in_net_worth, archived, balance_updated_at,
       server_version, sync_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       institution = excluded.institution,
       account_type = excluded.account_type,
       purpose = excluded.purpose,
       current_balance_minor = excluded.current_balance_minor,
       currency = excluded.currency,
       include_in_net_worth = excluded.include_in_net_worth,
       archived = excluded.archived,
       balance_updated_at = excluded.balance_updated_at,
       server_version = excluded.server_version,
       sync_status = 'synced',
       updated_at = excluded.updated_at`,
    change.entityId,
    payload.name,
    payload.institution,
    payload.accountType,
    payload.purpose,
    decimalToMinorUnits(payload.currentBalance),
    payload.currency,
    payload.includeInNetWorth ? 1 : 0,
    payload.archived ? 1 : 0,
    payload.balanceUpdatedAt,
    change.version,
    change.changedAt,
    change.changedAt,
  );
}

async function applyFinancialAccountSnapshotChange(
  db: SqlTxn,
  change: SyncChange,
): Promise<void> {
  if (change.entityType !== 'financial_account_snapshot') return;
  if (change.operation === 'delete') {
    await db.runAsync('DELETE FROM financial_account_snapshots WHERE id = ?', change.entityId);
    return;
  }

  const payload = change.payload;
  await db.runAsync(
    `INSERT INTO financial_account_snapshots (
       id, financial_account_id, balance_minor, include_in_net_worth, archived,
       recorded_at, source, pending
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(id) DO UPDATE SET
       financial_account_id = excluded.financial_account_id,
       balance_minor = excluded.balance_minor,
       include_in_net_worth = excluded.include_in_net_worth,
       archived = excluded.archived,
       recorded_at = excluded.recorded_at,
       source = excluded.source,
       pending = 0`,
    change.entityId,
    payload.financialAccountId,
    decimalToMinorUnits(payload.balance),
    payload.includeInNetWorth ? 1 : 0,
    payload.archived ? 1 : 0,
    payload.recordedAt,
    payload.source,
  );
}

export async function applySyncChange(
  db: SqlTxn,
  change: SyncChange,
  options: { force?: boolean } = {},
): Promise<void> {
  const force = options.force ?? false;
  switch (change.entityType) {
    case 'category':
      await applyCategoryChange(db, change, force);
      return;
    case 'transaction':
      await applyTransactionChange(db, change, force);
      return;
    case 'budget':
      await applyBudgetChange(db, change, force);
      return;
    case 'financial_account':
      await applyFinancialAccountChange(db, change, force);
      return;
    case 'financial_account_snapshot':
      await applyFinancialAccountSnapshotChange(db, change);
      return;
  }
}

export async function applyChangesAndCursor(
  db: SQLiteDatabase,
  changes: readonly SyncChange[],
  cursor: string,
): Promise<void> {
  const now = new Date().toISOString();
  await runKeyedTransaction(db, async (txn) => {
    for (const change of changes) await applySyncChange(txn, change);
    await txn.runAsync(
      `INSERT INTO sync_state (key, value, updated_at)
       VALUES ('sync_cursor', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      cursor,
      now,
    );
  });
}

export async function applyBootstrapPage(
  db: SQLiteDatabase,
  changes: readonly SyncChange[],
): Promise<void> {
  await runKeyedTransaction(db, async (txn) => {
    for (const change of changes) await applySyncChange(txn, change);
  });
}
