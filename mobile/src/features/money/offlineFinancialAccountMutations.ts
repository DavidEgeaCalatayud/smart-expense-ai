import type {
  FinancialAccountPurpose,
  FinancialAccountSyncPayload,
  FinancialAccountType,
  FinancialAccountUpsertMutation,
} from '@smart-expense-ai/api-contracts';
import { decimalToMinorUnits, minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../../database/keyedTransaction';
import type { LocalFinancialAccountRow } from '../../database/types';
import { assertEntityNotSending, enqueueMutation, type OutboxRow } from '../../sync/outboxRepository';

const MAX_BALANCE_MINOR = 999_999_999_999;

export interface OfflineFinancialAccountInput {
  name: string;
  institution: string | null;
  accountType: FinancialAccountType;
  purpose: FinancialAccountPurpose;
  currentBalance: string;
  includeInNetWorth: boolean;
}

export interface OfflineFinancialAccountMetadataInput {
  name: string;
  institution: string | null;
  accountType: FinancialAccountType;
  purpose: FinancialAccountPurpose;
  includeInNetWorth: boolean;
}

function cleanName(value: string): string {
  const clean = value.trim();
  if (!clean) throw new Error('Escribe un nombre para la cuenta.');
  if (clean.length > 120) throw new Error('El nombre de la cuenta es demasiado largo.');
  return clean;
}

function cleanInstitution(value: string | null): string | null {
  if (value === null) return null;
  const clean = value.trim();
  if (clean.length > 120) throw new Error('La institución es demasiado larga.');
  return clean || null;
}

function parseBalance(value: string): number {
  let minor: number;
  try {
    minor = decimalToMinorUnits(value.trim().replace(',', '.'));
  } catch {
    throw new Error('Introduce un saldo válido con hasta dos decimales.');
  }
  if (Math.abs(minor) > MAX_BALANCE_MINOR) {
    throw new Error('El saldo está fuera del rango admitido.');
  }
  return minor;
}

async function findAccount(db: SQLiteDatabase, accountId: string): Promise<LocalFinancialAccountRow> {
  const account = await db.getFirstAsync<LocalFinancialAccountRow>(
    'SELECT * FROM financial_accounts WHERE id = ? LIMIT 1',
    accountId,
  );
  if (!account) throw new Error('La cuenta ya no está disponible en este dispositivo.');
  return account;
}

function accountPayload(
  account: LocalFinancialAccountRow,
  balanceSnapshotId: string | null,
): FinancialAccountSyncPayload {
  return {
    name: account.name,
    institution: account.institution,
    accountType: account.account_type,
    purpose: account.purpose,
    currentBalance: minorUnitsToDecimal(account.current_balance_minor),
    currency: 'EUR',
    includeInNetWorth: account.include_in_net_worth === 1,
    archived: account.archived === 1,
    balanceUpdatedAt: account.balance_updated_at,
    balanceSnapshotId,
  };
}

async function insertPendingSnapshot(
  db: SQLiteDatabase,
  account: LocalFinancialAccountRow,
  snapshotId: string,
  now: string,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO financial_account_snapshots (
       id, financial_account_id, balance_minor, include_in_net_worth, archived,
       recorded_at, source, pending
     ) VALUES (?, ?, ?, ?, ?, ?, 'manual', 1)`,
    snapshotId,
    account.id,
    account.current_balance_minor,
    account.include_in_net_worth,
    account.archived,
    now,
  );
}

async function queueAccountUpsert(
  db: SQLiteDatabase,
  account: LocalFinancialAccountRow,
  requestedSnapshotId: string | null,
  now: string,
): Promise<void> {
  const existing = await db.getFirstAsync<OutboxRow>(
    `SELECT * FROM sync_outbox
     WHERE entity_type = 'financial_account' AND entity_id = ?
       AND status IN ('queued', 'failed')
     ORDER BY sequence DESC
     LIMIT 1`,
    account.id,
  );

  let snapshotId = requestedSnapshotId;
  if (existing?.operation === 'upsert' && existing.payload_json) {
    const previous = JSON.parse(existing.payload_json) as FinancialAccountSyncPayload;
    if (snapshotId === null) snapshotId = previous.balanceSnapshotId;
    if (
      requestedSnapshotId !== null
      && previous.balanceSnapshotId
      && previous.balanceSnapshotId !== requestedSnapshotId
    ) {
      await db.runAsync(
        'DELETE FROM financial_account_snapshots WHERE id = ? AND pending = 1',
        previous.balanceSnapshotId,
      );
    }
    await db.runAsync(
      `UPDATE sync_outbox
       SET payload_json = ?, status = 'queued', last_error = NULL,
           client_occurred_at = ?, updated_at = ?
       WHERE mutation_id = ?`,
      JSON.stringify(accountPayload(account, snapshotId)),
      now,
      now,
      existing.mutation_id,
    );
    return;
  }

  const mutation: FinancialAccountUpsertMutation = {
    mutationId: Crypto.randomUUID(),
    entityId: account.id,
    entityType: 'financial_account',
    operation: 'upsert',
    baseVersion: account.server_version,
    clientOccurredAt: now,
    payload: accountPayload(account, snapshotId),
  };
  await enqueueMutation(db, mutation, now);
}

export async function createOfflineFinancialAccount(
  db: SQLiteDatabase,
  input: OfflineFinancialAccountInput,
): Promise<string> {
  const id = Crypto.randomUUID();
  const snapshotId = Crypto.randomUUID();
  const now = new Date().toISOString();
  const balanceMinor = parseBalance(input.currentBalance);
  const account: LocalFinancialAccountRow = {
    id,
    name: cleanName(input.name),
    institution: cleanInstitution(input.institution),
    account_type: input.accountType,
    purpose: input.purpose,
    current_balance_minor: balanceMinor,
    currency: 'EUR',
    include_in_net_worth: input.includeInNetWorth ? 1 : 0,
    archived: 0,
    balance_updated_at: now,
    server_version: null,
    sync_status: 'pending',
    created_at: now,
    updated_at: now,
  };

  await runKeyedTransaction(db, async (txn) => {
    await txn.runAsync(
      `INSERT INTO financial_accounts (
         id, name, institution, account_type, purpose, current_balance_minor,
         currency, include_in_net_worth, archived, balance_updated_at,
         server_version, sync_status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'EUR', ?, 0, ?, NULL, 'pending', ?, ?)`,
      account.id,
      account.name,
      account.institution,
      account.account_type,
      account.purpose,
      account.current_balance_minor,
      account.include_in_net_worth,
      account.balance_updated_at,
      account.created_at,
      account.updated_at,
    );
    await insertPendingSnapshot(txn, account, snapshotId, now);
    await queueAccountUpsert(txn, account, snapshotId, now);
  });
  return id;
}

export async function updateOfflineFinancialAccountMetadata(
  db: SQLiteDatabase,
  accountId: string,
  input: OfflineFinancialAccountMetadataInput,
): Promise<void> {
  await runKeyedTransaction(db, async (txn) => {
    await assertEntityNotSending(txn, 'financial_account', accountId);
    const account = await findAccount(txn, accountId);
    if (account.sync_status === 'conflict') {
      throw new Error('Resuelve el conflicto de esta cuenta antes de editarla.');
    }
    const previousInclude = account.include_in_net_worth;
    const now = new Date().toISOString();
    account.name = cleanName(input.name);
    account.institution = cleanInstitution(input.institution);
    account.account_type = input.accountType;
    account.purpose = input.purpose;
    account.include_in_net_worth = input.includeInNetWorth ? 1 : 0;
    account.sync_status = 'pending';
    account.updated_at = now;

    await txn.runAsync(
      `UPDATE financial_accounts
       SET name = ?, institution = ?, account_type = ?, purpose = ?,
           include_in_net_worth = ?, sync_status = 'pending', updated_at = ?
       WHERE id = ?`,
      account.name,
      account.institution,
      account.account_type,
      account.purpose,
      account.include_in_net_worth,
      now,
      account.id,
    );
    const snapshotId = previousInclude === account.include_in_net_worth ? null : Crypto.randomUUID();
    if (snapshotId) await insertPendingSnapshot(txn, account, snapshotId, now);
    await queueAccountUpsert(txn, account, snapshotId, now);
  });
}

export async function updateOfflineFinancialAccountBalance(
  db: SQLiteDatabase,
  accountId: string,
  balance: string,
): Promise<void> {
  await runKeyedTransaction(db, async (txn) => {
    await assertEntityNotSending(txn, 'financial_account', accountId);
    const account = await findAccount(txn, accountId);
    if (account.sync_status === 'conflict') {
      throw new Error('Resuelve el conflicto de esta cuenta antes de cambiar el saldo.');
    }
    const balanceMinor = parseBalance(balance);
    if (balanceMinor === account.current_balance_minor) return;

    const snapshotId = Crypto.randomUUID();
    const now = new Date().toISOString();
    account.current_balance_minor = balanceMinor;
    account.balance_updated_at = now;
    account.sync_status = 'pending';
    account.updated_at = now;

    await txn.runAsync(
      `UPDATE financial_accounts
       SET current_balance_minor = ?, balance_updated_at = ?,
           sync_status = 'pending', updated_at = ?
       WHERE id = ?`,
      balanceMinor,
      now,
      now,
      account.id,
    );
    await insertPendingSnapshot(txn, account, snapshotId, now);
    await queueAccountUpsert(txn, account, snapshotId, now);
  });
}

export async function archiveOfflineFinancialAccount(
  db: SQLiteDatabase,
  accountId: string,
): Promise<void> {
  await runKeyedTransaction(db, async (txn) => {
    await assertEntityNotSending(txn, 'financial_account', accountId);
    const account = await findAccount(txn, accountId);
    if (account.sync_status === 'conflict') {
      throw new Error('Resuelve el conflicto de esta cuenta antes de archivarla.');
    }
    if (account.archived === 1) return;
    const now = new Date().toISOString();
    const snapshotId = Crypto.randomUUID();
    account.archived = 1;
    account.sync_status = 'pending';
    account.updated_at = now;
    await txn.runAsync(
      `UPDATE financial_accounts
       SET archived = 1, sync_status = 'pending', updated_at = ?
       WHERE id = ?`,
      now,
      account.id,
    );
    await insertPendingSnapshot(txn, account, snapshotId, now);
    await queueAccountUpsert(txn, account, snapshotId, now);
  });
}
