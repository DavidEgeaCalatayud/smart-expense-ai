import type {
  FinancialAccountBalanceObservationSyncPayload,
  FinancialAccountHistoryBaseSyncPayload,
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

interface PendingSnapshotRow {
  id: string;
  balance_minor: number;
  include_in_net_worth: number;
  archived: number;
  recorded_at: string;
  source: 'manual' | 'open_banking' | 'import';
}

type BalanceMutationFinalizer = (transaction: SQLiteDatabase) => Promise<void>;

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

function normalizePurpose(
  accountType: FinancialAccountType,
  purpose: FinancialAccountPurpose,
): FinancialAccountPurpose {
  return accountType === 'broker' ? 'investment' : purpose;
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

function historyBaseFromAccount(account: LocalFinancialAccountRow): FinancialAccountHistoryBaseSyncPayload {
  return {
    currentBalance: minorUnitsToDecimal(account.current_balance_minor),
    includeInNetWorth: account.include_in_net_worth === 1,
    archived: account.archived === 1,
  };
}

function observationFromAccount(
  account: LocalFinancialAccountRow,
  snapshotId: string,
  recordedAt: string,
): FinancialAccountBalanceObservationSyncPayload {
  return {
    id: snapshotId,
    balance: minorUnitsToDecimal(account.current_balance_minor),
    includeInNetWorth: account.include_in_net_worth === 1,
    archived: account.archived === 1,
    recordedAt,
    source: 'manual',
  };
}

function finalStateDiffersFromBase(
  account: LocalFinancialAccountRow,
  historyBase: FinancialAccountHistoryBaseSyncPayload | null,
): boolean {
  if (historyBase === null) return true;
  return (
    minorUnitsToDecimal(account.current_balance_minor) !== historyBase.currentBalance
    || (account.include_in_net_worth === 1) !== historyBase.includeInNetWorth
    || (account.archived === 1) !== historyBase.archived
  );
}

function accountPayload(
  account: LocalFinancialAccountRow,
  historyBase: FinancialAccountHistoryBaseSyncPayload | null,
  observations: FinancialAccountBalanceObservationSyncPayload[],
): FinancialAccountSyncPayload {
  const latestObservation = observations.at(-1) ?? null;
  const balanceSnapshotId = latestObservation && finalStateDiffersFromBase(account, historyBase)
    ? latestObservation.id
    : null;

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
    historyBase,
    balanceObservations: observations,
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

async function recoverLegacyObservation(
  db: SQLiteDatabase,
  snapshotId: string,
): Promise<FinancialAccountBalanceObservationSyncPayload | null> {
  const snapshot = await db.getFirstAsync<PendingSnapshotRow>(
    `SELECT id, balance_minor, include_in_net_worth, archived, recorded_at, source
     FROM financial_account_snapshots
     WHERE id = ? AND pending = 1
     LIMIT 1`,
    snapshotId,
  );
  if (!snapshot || snapshot.source !== 'manual') return null;
  return {
    id: snapshot.id,
    balance: minorUnitsToDecimal(snapshot.balance_minor),
    includeInNetWorth: snapshot.include_in_net_worth === 1,
    archived: snapshot.archived === 1,
    recordedAt: snapshot.recorded_at,
    source: 'manual',
  };
}

async function queueAccountUpsert(
  db: SQLiteDatabase,
  account: LocalFinancialAccountRow,
  requestedObservation: FinancialAccountBalanceObservationSyncPayload | null,
  requestedHistoryBase: FinancialAccountHistoryBaseSyncPayload | null,
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

  let historyBase = requestedHistoryBase;
  let observations: FinancialAccountBalanceObservationSyncPayload[] = [];

  if (existing?.operation === 'upsert' && existing.payload_json) {
    const previous = JSON.parse(existing.payload_json) as FinancialAccountSyncPayload;
    if (Object.prototype.hasOwnProperty.call(previous, 'historyBase')) {
      historyBase = previous.historyBase ?? null;
    }
    observations = [...(previous.balanceObservations ?? [])];
    if (observations.length === 0 && previous.balanceSnapshotId) {
      const legacyObservation = await recoverLegacyObservation(db, previous.balanceSnapshotId);
      if (legacyObservation) observations.push(legacyObservation);
    }
    if (
      requestedObservation
      && !observations.some((observation) => observation.id === requestedObservation.id)
    ) {
      observations.push(requestedObservation);
    }
    observations.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));

    await db.runAsync(
      `UPDATE sync_outbox
       SET payload_json = ?, status = 'queued', last_error = NULL,
           client_occurred_at = ?, updated_at = ?
       WHERE mutation_id = ?`,
      JSON.stringify(accountPayload(account, historyBase, observations)),
      now,
      now,
      existing.mutation_id,
    );
    return;
  }

  if (requestedObservation) observations.push(requestedObservation);
  const mutation: FinancialAccountUpsertMutation = {
    mutationId: Crypto.randomUUID(),
    entityId: account.id,
    entityType: 'financial_account',
    operation: 'upsert',
    baseVersion: account.server_version,
    clientOccurredAt: now,
    payload: accountPayload(account, historyBase, observations),
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
    purpose: normalizePurpose(input.accountType, input.purpose),
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
    await queueAccountUpsert(txn, account, observationFromAccount(account, snapshotId, now), null, now);
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
    const historyBase = historyBaseFromAccount(account);
    const previousInclude = account.include_in_net_worth;
    const now = new Date().toISOString();
    account.name = cleanName(input.name);
    account.institution = cleanInstitution(input.institution);
    account.account_type = input.accountType;
    account.purpose = normalizePurpose(input.accountType, input.purpose);
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
    let observation: FinancialAccountBalanceObservationSyncPayload | null = null;
    if (snapshotId) {
      await insertPendingSnapshot(txn, account, snapshotId, now);
      observation = observationFromAccount(account, snapshotId, now);
    }
    await queueAccountUpsert(txn, account, observation, historyBase, now);
  });
}

async function updateOfflineFinancialAccountBalanceInTransaction(
  transaction: SQLiteDatabase,
  accountId: string,
  balance: string,
  finalize?: BalanceMutationFinalizer,
): Promise<void> {
  await assertEntityNotSending(transaction, 'financial_account', accountId);
  const account = await findAccount(transaction, accountId);
  if (account.sync_status === 'conflict') {
    throw new Error('Resuelve el conflicto de esta cuenta antes de cambiar el saldo.');
  }
  const balanceMinor = parseBalance(balance);
  if (balanceMinor === account.current_balance_minor) {
    if (finalize) await finalize(transaction);
    return;
  }

  const historyBase = historyBaseFromAccount(account);
  const snapshotId = Crypto.randomUUID();
  const now = new Date().toISOString();
  account.current_balance_minor = balanceMinor;
  account.balance_updated_at = now;
  account.sync_status = 'pending';
  account.updated_at = now;

  await transaction.runAsync(
    `UPDATE financial_accounts
     SET current_balance_minor = ?, balance_updated_at = ?,
         sync_status = 'pending', updated_at = ?
     WHERE id = ?`,
    balanceMinor,
    now,
    now,
    account.id,
  );
  await insertPendingSnapshot(transaction, account, snapshotId, now);
  await queueAccountUpsert(
    transaction,
    account,
    observationFromAccount(account, snapshotId, now),
    historyBase,
    now,
  );
  if (finalize) await finalize(transaction);
}

export async function updateOfflineFinancialAccountBalance(
  db: SQLiteDatabase,
  accountId: string,
  balance: string,
): Promise<void> {
  await runKeyedTransaction(db, (transaction) => (
    updateOfflineFinancialAccountBalanceInTransaction(transaction, accountId, balance)
  ));
}

export async function updateOfflineFinancialAccountBalanceAtomically(
  db: SQLiteDatabase,
  accountId: string,
  balance: string,
  finalize: BalanceMutationFinalizer,
): Promise<void> {
  await runKeyedTransaction(db, (transaction) => (
    updateOfflineFinancialAccountBalanceInTransaction(transaction, accountId, balance, finalize)
  ));
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
    const historyBase = historyBaseFromAccount(account);
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
    await queueAccountUpsert(
      txn,
      account,
      observationFromAccount(account, snapshotId, now),
      historyBase,
      now,
    );
  });
}
