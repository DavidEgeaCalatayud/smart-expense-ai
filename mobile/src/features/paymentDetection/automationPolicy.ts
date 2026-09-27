import type {
  ParsedPaymentNotification,
  PaymentAccountMatch,
  PaymentDetectionSettings,
} from './types';

export const MIN_AUTOMATIC_ACCOUNT_MATCH_CONFIDENCE = 0.8;
export const AUTOMATIC_PAYMENT_FRESHNESS_MS = 15 * 60_000;

const AUTO_ELIGIBLE_KINDS = new Set([
  'payment',
  'refund',
  'transfer_in',
  'transfer_out',
]);

export function combinedPaymentConfidence(
  parsed: ParsedPaymentNotification,
  match: PaymentAccountMatch,
): number {
  return Math.min(
    1,
    Number((parsed.parserConfidence * 0.65 + match.confidence * 0.35).toFixed(2)),
  );
}

export function shouldAutomaticallyApplyPayment(
  settings: PaymentDetectionSettings,
  parsed: ParsedPaymentNotification,
  match: PaymentAccountMatch,
  nowMs = Date.now(),
): boolean {
  const occurredAt = new Date(parsed.occurredAt).getTime();
  const fresh = Number.isFinite(occurredAt)
    && Math.abs(nowMs - occurredAt) <= AUTOMATIC_PAYMENT_FRESHNESS_MS;

  return settings.enabled
    && settings.mode === 'automatic'
    && parsed.currency === 'EUR'
    && parsed.amountMinor !== null
    && parsed.amountMinor > 0
    && match.accountId !== null
    // A perfect parser must never compensate for a weak account guess. In particular,
    // the single-active-account fallback scores 0.62 and therefore always requires review.
    && match.confidence >= MIN_AUTOMATIC_ACCOUNT_MATCH_CONFIDENCE
    && AUTO_ELIGIBLE_KINDS.has(parsed.kind)
    && fresh
    && combinedPaymentConfidence(parsed, match) >= settings.autoConfidence;
}
