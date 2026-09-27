import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { LocalFinancialAccountRow } from '../../database/types';
import { updateOfflineFinancialAccountBalance } from '../money/offlineFinancialAccountMutations';
import { createOfflineTransaction } from '../transactions/createOfflineTransaction';
import { localDate } from '../transactions/validation';
import { matchPaymentAccount } from './accountMatcher';
import {
  acknowledgePaymentNotificationCandidate,
  getPendingPaymentNotificationCandidates,
  type NativePaymentNotificationCandidate,
} from './nativePaymentNotifications';
import { parsePaymentNotification } from './parser';
import {
  findLikelyDuplicateEvent,
  findObservedEventByNotificationKey,
  getPaymentDetectionSettings,
  insertObservedPaymentEvent,
  linkPaymentSourceToAccount,
  updateObservedPaymentEvent,
} from './repository';
import type { ObservedPaymentEventRow } from './types';

let processingChain: Promise<void> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const result = processingChain.catch(() => undefined).then(task);
  processingChain = result.then(() => undefined, () => undefined);
  return result;
}

function autoEligibleKind(kind: ObservedPaymentEventRow['event_kind']): boolean {
  return ['payment', 'refund', 'transfer_in', 'transfer_out'].includes(kind);
}

function isFreshEnoughForAutomatic(occurredAt: string): boolean {
  const time = new Date(occurredAt).getTime();
  return Number.isFinite(time) && Math.abs(Date.now() - time) <= 15 * 60_000;
}

async function applyObservedPaymentEventUnlocked(
  db: SQLiteDatabase,
  eventId: string,
  accountIdOverride?: string,
  rememberAssociation = false,
): Promise<void> {
  let event = await db.getFirstAsync<ObservedPaymentEventRow>(
    'SELECT * FROM observed_payment_events WHERE id = ? LIMIT 1',
    eventId,
  );
  if (!event) throw new Error('El pago detectado ya no está disponible.');
  if (event.status === 'applied') return;
  if (!autoEligibleKind(event.event_kind)) {
    throw new Error('Esta notificación no representa un movimiento aplicable automáticamente.');
  }
  if (event.amount_minor === null || event.amount_minor <= 0 || event.currency !== 'EUR') {
    throw new Error('Solo se pueden aplicar automáticamente importes válidos en EUR.');
  }

  const accountId = accountIdOverride ?? event.financial_account_id;
  if (!accountId) throw new Error('Elige la cuenta a la que pertenece este movimiento.');
  const account = await db.getFirstAsync<LocalFinancialAccountRow>(
    'SELECT * FROM financial_accounts WHERE id = ? AND archived = 0 LIMIT 1',
    accountId,
  );
  if (!account) throw new Error('La cuenta seleccionada ya no está disponible.');

  if (accountId !== event.financial_account_id) {
    await updateObservedPaymentEvent(db, eventId, { financialAccountId: accountId });
    event = { ...event, financial_account_id: accountId };
  }

  if (rememberAssociation) {
    await linkPaymentSourceToAccount(db, event.source_package, event.card_hint, accountId);
  }

  if (!event.transaction_id) {
    const isIncome = event.event_kind === 'refund' || event.event_kind === 'transfer_in';
    const transaction = await createOfflineTransaction(db, {
      merchant: event.merchant || event.source_label || 'Movimiento detectado',
      categoryName: isIncome ? 'Ingresos detectados' : 'Compras detectadas',
      amount: minorUnitsToDecimal(event.amount_minor),
      transactionDate: localDate(new Date(event.occurred_at)),
      transactionType: isIncome ? 'income' : 'expense',
      paymentMethod: event.event_kind.startsWith('transfer_') ? 'bank_transfer' : 'card',
      description: `Detectado por ${event.source_label}`,
      isRecurring: false,
    });
    await updateObservedPaymentEvent(db, eventId, {
      status: 'balance_pending',
      transactionId: transaction.transactionId,
      errorMessage: null,
    });
    event = { ...event, transaction_id: transaction.transactionId, status: 'balance_pending' };
  }

  const latestAccount = await db.getFirstAsync<LocalFinancialAccountRow>(
    'SELECT * FROM financial_accounts WHERE id = ? AND archived = 0 LIMIT 1',
    accountId,
  );
  if (!latestAccount) throw new Error('La cuenta seleccionada ya no está disponible.');
  const direction = event.event_kind === 'refund' || event.event_kind === 'transfer_in' ? 1 : -1;
  const nextBalance = latestAccount.current_balance_minor + direction * event.amount_minor;
  await updateOfflineFinancialAccountBalance(db, accountId, minorUnitsToDecimal(nextBalance));
  await updateObservedPaymentEvent(db, eventId, {
    status: 'applied',
    financialAccountId: accountId,
    errorMessage: null,
  });
}

export async function ingestPaymentNotificationCandidate(
  db: SQLiteDatabase,
  candidate: NativePaymentNotificationCandidate,
): Promise<string | null> {
  const settings = await getPaymentDetectionSettings(db);
  if (!settings.enabled) return null;

  const existing = await findObservedEventByNotificationKey(db, candidate.notificationKey);
  if (existing) return existing.id;

  const parsed = parsePaymentNotification(candidate);
  const match = await matchPaymentAccount(db, parsed);
  const duplicate = await findLikelyDuplicateEvent(db, parsed);
  if (duplicate) {
    return await insertObservedPaymentEvent(db, parsed, match, 'duplicate');
  }

  if (parsed.kind === 'rejected') {
    return await insertObservedPaymentEvent(db, parsed, match, 'rejected');
  }

  const combinedConfidence = Math.min(
    1,
    Number((parsed.parserConfidence * 0.65 + match.confidence * 0.35).toFixed(2)),
  );
  const canAutoApply = settings.mode === 'automatic'
    && parsed.currency === 'EUR'
    && parsed.amountMinor !== null
    && parsed.amountMinor > 0
    && match.accountId !== null
    && autoEligibleKind(parsed.kind)
    && isFreshEnoughForAutomatic(parsed.occurredAt)
    && combinedConfidence >= settings.autoConfidence;

  const eventId = await insertObservedPaymentEvent(
    db,
    parsed,
    match,
    canAutoApply ? 'pending' : 'needs_confirmation',
  );
  if (canAutoApply) {
    await applyObservedPaymentEventUnlocked(db, eventId).catch(async (error) => {
      await updateObservedPaymentEvent(db, eventId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
  }
  return eventId;
}

export async function processNativePaymentCandidate(
  db: SQLiteDatabase,
  candidate: NativePaymentNotificationCandidate,
): Promise<void> {
  await serialize(async () => {
    await ingestPaymentNotificationCandidate(db, candidate);
    await acknowledgePaymentNotificationCandidate(candidate.notificationKey);
  });
}

export async function drainNativePaymentCandidates(db: SQLiteDatabase): Promise<number> {
  const candidates = await getPendingPaymentNotificationCandidates();
  let processed = 0;
  for (const candidate of candidates) {
    await processNativePaymentCandidate(db, candidate);
    processed += 1;
  }
  return processed;
}

export async function applyObservedPaymentEvent(
  db: SQLiteDatabase,
  eventId: string,
  accountIdOverride?: string,
  rememberAssociation = false,
): Promise<void> {
  await serialize(() => applyObservedPaymentEventUnlocked(
    db,
    eventId,
    accountIdOverride,
    rememberAssociation,
  ));
}

export async function ignoreObservedPaymentEvent(db: SQLiteDatabase, eventId: string): Promise<void> {
  await updateObservedPaymentEvent(db, eventId, { status: 'ignored', errorMessage: null });
}
