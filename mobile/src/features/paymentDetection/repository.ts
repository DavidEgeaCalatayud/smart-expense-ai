import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../../database/keyedTransaction';
import { combinedPaymentConfidence } from './automationPolicy';
import type {
  ObservedPaymentEventRow,
  ObservedPaymentStatus,
  ParsedPaymentNotification,
  PaymentAccountMatch,
  PaymentDetectionMode,
  PaymentDetectionSettings,
} from './types';

interface SettingsRow {
  enabled: number;
  mode: PaymentDetectionMode;
  auto_confidence: number;
}

function notificationGroupKey(key: string): string {
  const revisionMarker = key.lastIndexOf('#rev=');
  return revisionMarker >= 0 ? key.slice(0, revisionMarker) : key;
}

function terminalFinancialState(event: ObservedPaymentEventRow): boolean {
  return event.transaction_id !== null
    || ['applied', 'ignored', 'rejected', 'duplicate'].includes(event.status);
}

export async function getPaymentDetectionSettings(db: SQLiteDatabase): Promise<PaymentDetectionSettings> {
  const row = await db.getFirstAsync<SettingsRow>(
    'SELECT enabled, mode, auto_confidence FROM payment_detection_settings WHERE id = 1',
  );
  return {
    enabled: row?.enabled === 1,
    mode: row?.mode ?? 'confirm',
    autoConfidence: row?.auto_confidence ?? 0.85,
  };
}

export async function setPaymentDetectionSettings(
  db: SQLiteDatabase,
  settings: PaymentDetectionSettings,
): Promise<void> {
  const autoConfidence = Math.max(0.5, Math.min(1, settings.autoConfidence));
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE payment_detection_settings
     SET enabled = ?, mode = ?, auto_confidence = ?, updated_at = ?
     WHERE id = 1`,
    settings.enabled ? 1 : 0,
    settings.mode,
    autoConfidence,
    now,
  );
}

export async function findObservedEventByNotificationKey(
  db: SQLiteDatabase,
  notificationKey: string,
): Promise<ObservedPaymentEventRow | null> {
  return await db.getFirstAsync<ObservedPaymentEventRow>(
    'SELECT * FROM observed_payment_events WHERE notification_key = ? LIMIT 1',
    notificationKey,
  ) ?? null;
}

export async function findObservedEventByNotificationGroup(
  db: SQLiteDatabase,
  event: ParsedPaymentNotification,
): Promise<ObservedPaymentEventRow | null> {
  const groupKey = notificationGroupKey(event.notificationKey);
  if (!groupKey || groupKey === event.notificationKey) return null;
  const captured = new Date(event.capturedAt).getTime();
  if (!Number.isFinite(captured)) return null;
  const from = new Date(captured - 30 * 60_000).toISOString();
  const to = new Date(captured + 30 * 60_000).toISOString();
  const candidates = await db.getAllAsync<ObservedPaymentEventRow>(
    `SELECT * FROM observed_payment_events
     WHERE source_package = ? AND captured_at BETWEEN ? AND ? AND status <> 'duplicate'
     ORDER BY captured_at DESC LIMIT 24`,
    event.sourcePackage,
    from,
    to,
  );
  return candidates.find((candidate) => {
    const sameGroup = candidate.notification_key !== event.notificationKey
      && notificationGroupKey(candidate.notification_key) === groupKey;
    if (!sameGroup) return false;

    // Once a notification has created/closed financial state, a later revision with a different
    // movement kind is not cosmetic metadata. Example: an applied payment becoming a refund, or a
    // rejected authorization later becoming a successful payment. Let the ingestion pipeline
    // create a separate event instead of swallowing the compensating/new movement.
    if (
      terminalFinancialState(candidate)
      && event.kind !== 'unknown'
      && event.kind !== candidate.event_kind
    ) return false;

    return true;
  }) ?? null;
}

export async function findLikelyDuplicateEvent(
  db: SQLiteDatabase,
  event: ParsedPaymentNotification,
): Promise<ObservedPaymentEventRow | null> {
  if (event.amountMinor === null || !event.currency) return null;
  const occurred = new Date(event.occurredAt).getTime();
  if (!Number.isFinite(occurred)) return null;
  const from = new Date(occurred - 5 * 60_000).toISOString();
  const to = new Date(occurred + 5 * 60_000).toISOString();
  const candidates = await db.getAllAsync<ObservedPaymentEventRow>(
    `SELECT * FROM observed_payment_events
     WHERE amount_minor = ? AND currency = ? AND occurred_at BETWEEN ? AND ?
       AND status NOT IN ('ignored', 'rejected')
       AND (status <> 'failed' OR transaction_id IS NOT NULL)
     ORDER BY occurred_at DESC LIMIT 12`,
    event.amountMinor,
    event.currency,
    from,
    to,
  );
  const merchant = event.merchant?.toLocaleLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, '') ?? '';
  const incomingGroupKey = notificationGroupKey(event.notificationKey);
  return candidates.find((candidate) => {
    if (candidate.notification_key === event.notificationKey) return true;
    const sameSource = candidate.source_package === event.sourcePackage;
    if (
      sameSource
      && notificationGroupKey(candidate.notification_key) === incomingGroupKey
    ) return true;
    if (candidate.event_kind !== event.kind) return false;

    const candidateTime = new Date(candidate.occurred_at).getTime();
    if (!Number.isFinite(candidateTime)) return false;
    const delta = Math.abs(candidateTime - occurred);
    const otherMerchant = candidate.merchant?.toLocaleLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, '') ?? '';
    // Merchant similarity is useful for Wallet <-> bank reconciliation, but it is unsafe
    // within one source: two real purchases at the same shop can have the same amount only
    // seconds apart. Cross-source merchant matches are also kept to a tight time window.
    if (!sameSource && delta <= 120_000 && merchant && otherMerchant) {
      return merchant === otherMerchant
        || merchant.includes(otherMerchant)
        || otherMerchant.includes(merchant);
    }
    if (!event.cardHint || !candidate.card_hint || event.cardHint !== candidate.card_hint) return false;
    if (sameSource) return false;
    return delta <= 90_000;
  }) ?? null;
}

export async function reconcileObservedPaymentEventRevision(
  db: SQLiteDatabase,
  canonical: ObservedPaymentEventRow,
  incoming: ParsedPaymentNotification,
  match: PaymentAccountMatch,
  requestedStatus: ObservedPaymentStatus,
): Promise<boolean> {
  // Never rewrite an event after it has created financial state. A late Android notification
  // revision may improve display metadata, but it must not change an applied/ignored decision
  // or a transaction that is waiting for its balance update.
  if (
    canonical.transaction_id !== null
    || ['applied', 'ignored', 'rejected', 'duplicate'].includes(canonical.status)
  ) return false;

  const effectiveKind = incoming.kind === 'unknown' ? canonical.event_kind : incoming.kind;
  const status = effectiveKind === 'rejected' ? 'rejected' : requestedStatus;
  const accountId = canonical.financial_account_id ?? match.accountId;
  const confidence = Math.max(canonical.confidence, combinedPaymentConfidence(incoming, match));
  await db.runAsync(
    `UPDATE observed_payment_events
     SET source_label = ?, notification_id = ?, occurred_at = ?, captured_at = ?,
         title = ?, body = ?, merchant = ?, amount_minor = ?, currency = ?, card_hint = ?,
         event_kind = ?, financial_account_id = ?, confidence = ?, status = ?, fingerprint = ?,
         error_message = NULL, updated_at = ?
     WHERE id = ?`,
    incoming.sourceLabel,
    incoming.notificationId,
    incoming.occurredAt,
    incoming.capturedAt,
    incoming.title,
    incoming.body,
    incoming.merchant ?? canonical.merchant,
    incoming.amountMinor ?? canonical.amount_minor,
    incoming.currency ?? canonical.currency,
    incoming.cardHint ?? canonical.card_hint,
    effectiveKind,
    accountId,
    confidence,
    status,
    incoming.fingerprint ?? canonical.fingerprint,
    new Date().toISOString(),
    canonical.id,
  );
  return true;
}

export async function enrichObservedPaymentEventFromDuplicate(
  db: SQLiteDatabase,
  canonical: ObservedPaymentEventRow,
  incoming: ParsedPaymentNotification,
  match: PaymentAccountMatch,
): Promise<void> {
  // Once the user has ignored an event or it has been applied/rejected, duplicate evidence
  // is useful for audit only and must not mutate the canonical decision.
  if (['applied', 'ignored', 'rejected'].includes(canonical.status)) return;

  const incomingConfidence = combinedPaymentConfidence(incoming, match);
  const merchant = canonical.merchant ?? incoming.merchant;
  const cardHint = canonical.card_hint ?? incoming.cardHint;
  const accountId = canonical.financial_account_id ?? match.accountId;
  const confidence = Math.max(canonical.confidence, incomingConfidence);

  if (
    merchant === canonical.merchant
    && cardHint === canonical.card_hint
    && accountId === canonical.financial_account_id
    && confidence === canonical.confidence
  ) return;

  await db.runAsync(
    `UPDATE observed_payment_events
     SET merchant = ?, card_hint = ?, financial_account_id = ?, confidence = ?, updated_at = ?
     WHERE id = ?`,
    merchant,
    cardHint,
    accountId,
    confidence,
    new Date().toISOString(),
    canonical.id,
  );
}

export async function insertObservedPaymentEvent(
  db: SQLiteDatabase,
  event: ParsedPaymentNotification,
  match: PaymentAccountMatch,
  status: ObservedPaymentStatus,
): Promise<string> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO observed_payment_events (
       id, source_package, source_label, notification_key, notification_id,
       occurred_at, captured_at, title, body, merchant, amount_minor, currency,
       card_hint, event_kind, financial_account_id, transaction_id, confidence,
       status, fingerprint, error_message, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`,
    id,
    event.sourcePackage,
    event.sourceLabel,
    event.notificationKey,
    event.notificationId,
    event.occurredAt,
    event.capturedAt,
    event.title,
    event.body,
    event.merchant,
    event.amountMinor,
    event.currency,
    event.cardHint,
    event.kind,
    match.accountId,
    combinedPaymentConfidence(event, match),
    status,
    event.fingerprint,
    now,
    now,
  );
  return id;
}

export async function updateObservedPaymentEvent(
  db: SQLiteDatabase,
  eventId: string,
  values: {
    status?: ObservedPaymentStatus;
    financialAccountId?: string | null;
    transactionId?: string | null;
    confidence?: number;
    errorMessage?: string | null;
  },
): Promise<void> {
  const event = await db.getFirstAsync<ObservedPaymentEventRow>(
    'SELECT * FROM observed_payment_events WHERE id = ? LIMIT 1',
    eventId,
  );
  if (!event) return;
  await db.runAsync(
    `UPDATE observed_payment_events
     SET status = ?, financial_account_id = ?, transaction_id = ?, confidence = ?,
         error_message = ?, updated_at = ? WHERE id = ?`,
    values.status ?? event.status,
    values.financialAccountId === undefined ? event.financial_account_id : values.financialAccountId,
    values.transactionId === undefined ? event.transaction_id : values.transactionId,
    values.confidence ?? event.confidence,
    values.errorMessage === undefined ? event.error_message : values.errorMessage,
    new Date().toISOString(),
    eventId,
  );
}

export async function listObservedPaymentEvents(
  db: SQLiteDatabase,
  limit = 30,
): Promise<ObservedPaymentEventRow[]> {
  return await db.getAllAsync<ObservedPaymentEventRow>(
    `SELECT * FROM observed_payment_events
     ORDER BY occurred_at DESC, created_at DESC LIMIT ?`,
    Math.max(1, Math.min(limit, 100)),
  );
}

export async function linkPaymentSourceToAccount(
  db: SQLiteDatabase,
  sourcePackage: string,
  cardHint: string | null,
  accountId: string,
): Promise<void> {
  const key = cardHint ?? '';
  const now = new Date().toISOString();
  await runKeyedTransaction(db, async (txn) => {
    await txn.runAsync(
      `INSERT INTO payment_account_links (
         id, source_package, card_hint, financial_account_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_package, card_hint) DO UPDATE SET
         financial_account_id = excluded.financial_account_id,
         updated_at = excluded.updated_at`,
      Crypto.randomUUID(),
      sourcePackage,
      key,
      accountId,
      now,
      now,
    );
  });
}

export async function clearPaymentDetectionData(db: SQLiteDatabase): Promise<void> {
  await runKeyedTransaction(db, async (txn) => {
    await txn.execAsync('DELETE FROM observed_payment_events');
    await txn.execAsync('DELETE FROM payment_account_links');
    await txn.execAsync("UPDATE payment_detection_settings SET enabled = 0, mode = 'confirm', auto_confidence = 0.85, updated_at = datetime('now') WHERE id = 1");
  });
}
