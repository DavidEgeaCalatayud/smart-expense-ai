import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getMobileUser } from '../../auth/secureCredentials';
import type { LocalFinancialAccountRow } from '../../database/types';
import { updateOfflineFinancialAccountBalanceAtomically } from '../money/offlineFinancialAccountMutations';
import { createOfflineTransaction } from '../transactions/createOfflineTransaction';
import { localDate } from '../transactions/validation';
import { matchPaymentAccount } from './accountMatcher';
import { shouldAutomaticallyApplyPayment } from './automationPolicy';
import { paymentEventIgnoreError } from './eventPolicy';
import {
  acknowledgePaymentNotificationCandidate,
  getPendingPaymentNotificationCandidates,
  type NativePaymentNotificationCandidate,
} from './nativePaymentNotifications';
import { parsePaymentNotification } from './parser';
import { showDetectedPaymentNotification } from './paymentDetectionNotifications';
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

async function notifyEvent(db: SQLiteDatabase, eventId: string): Promise<void> {
  const [user, event] = await Promise.all([
    getMobileUser(),
    db.getFirstAsync<ObservedPaymentEventRow>(
      'SELECT * FROM observed_payment_events WHERE id = ? LIMIT 1',
      eventId,
    ),
  ]);
  if (!user || !event || ['duplicate', 'ignored', 'rejected'].includes(event.status)) return;
  const account = event.financial_account_id
    ? await db.getFirstAsync<Pick<LocalFinancialAccountRow, 'name'>>(
        'SELECT name FROM financial_accounts WHERE id = ? LIMIT 1',
        event.financial_account_id,
      )
    : null;
  const amount = event.amount_minor === null || !event.currency
    ? 'Importe sin reconocer'
    : `${minorUnitsToDecimal(event.amount_minor)} ${event.currency}`;
  const merchant = event.merchant || event.source_label;
  const body = `${amount} · ${merchant}${account?.name ? ` · ${account.name}` : ''}`;
  const title = event.status === 'applied'
    ? 'Movimiento guardado automáticamente'
    : event.status === 'failed' || event.status === 'balance_pending'
      ? 'Movimiento detectado: necesita revisión'
      : 'Movimiento detectado';
  await showDetectedPaymentNotification({ userId: user.id, eventId, title, body });
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
  const amountMinor = event.amount_minor;
  if (amountMinor === null || amountMinor <= 0 || event.currency !== 'EUR') {
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

  // Never learn a source-only mapping from a generic wallet notification: one Wallet app
  // can contain several cards. A last-four card hint gives us a safe reusable association.
  if (rememberAssociation && event.card_hint) {
    await linkPaymentSourceToAccount(db, event.source_package, event.card_hint, accountId);
  }

  if (!event.transaction_id) {
    const isIncome = event.event_kind === 'refund' || event.event_kind === 'transfer_in';
    const transaction = await createOfflineTransaction(
      db,
      {
        merchant: event.merchant || event.source_label || 'Movimiento detectado',
        categoryName: isIncome ? 'Ingresos detectados' : 'Compras detectadas',
        amount: minorUnitsToDecimal(amountMinor),
        transactionDate: localDate(new Date(event.occurred_at)),
        transactionType: isIncome ? 'income' : 'expense',
        paymentMethod: event.event_kind.startsWith('transfer_') ? 'bank_transfer' : 'card',
        description: `Detectado por ${event.source_label}`,
        isRecurring: false,
      },
      {
        finalize: async (transactionDb, result) => {
          await transactionDb.runAsync(
            `UPDATE observed_payment_events
             SET status = 'balance_pending', transaction_id = ?, error_message = NULL, updated_at = ?
             WHERE id = ?`,
            result.transactionId,
            new Date().toISOString(),
            eventId,
          );
        },
      },
    );
    event = { ...event, transaction_id: transaction.transactionId, status: 'balance_pending' };
  }

  const latestAccount = await db.getFirstAsync<LocalFinancialAccountRow>(
    'SELECT * FROM financial_accounts WHERE id = ? AND archived = 0 LIMIT 1',
    accountId,
  );
  if (!latestAccount) throw new Error('La cuenta seleccionada ya no está disponible.');
  const direction = event.event_kind === 'refund' || event.event_kind === 'transfer_in' ? 1 : -1;
  const nextBalance = latestAccount.current_balance_minor + direction * amountMinor;
  await updateOfflineFinancialAccountBalanceAtomically(
    db,
    accountId,
    minorUnitsToDecimal(nextBalance),
    async (transactionDb) => {
      await transactionDb.runAsync(
        `UPDATE observed_payment_events
         SET status = 'applied', financial_account_id = ?, error_message = NULL, updated_at = ?
         WHERE id = ?`,
        accountId,
        new Date().toISOString(),
        eventId,
      );
    },
  );
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

  const canAutoApply = shouldAutomaticallyApplyPayment(settings, parsed, match);
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
  await notifyEvent(db, eventId).catch(() => undefined);
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
  await serialize(async () => {
    const event = await db.getFirstAsync<ObservedPaymentEventRow>(
      'SELECT * FROM observed_payment_events WHERE id = ? LIMIT 1',
      eventId,
    );
    if (!event || event.status === 'ignored') return;
    const blockReason = paymentEventIgnoreError(event);
    if (blockReason) throw new Error(blockReason);
    await updateObservedPaymentEvent(db, eventId, { status: 'ignored', errorMessage: null });
  });
}
