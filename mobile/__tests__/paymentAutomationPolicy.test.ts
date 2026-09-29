import {
  MIN_AUTOMATIC_ACCOUNT_MATCH_CONFIDENCE,
  shouldAutomaticallyApplyPayment,
} from '../src/features/paymentDetection/automationPolicy';
import type {
  ParsedPaymentNotification,
  PaymentAccountMatch,
  PaymentDetectionSettings,
} from '../src/features/paymentDetection/types';

const NOW = Date.parse('2026-09-27T18:45:00Z');

function parsed(overrides: Partial<ParsedPaymentNotification> = {}): ParsedPaymentNotification {
  return {
    sourcePackage: 'com.bankinter.launcher',
    sourceLabel: 'Bankinter',
    notificationKey: 'payment-1',
    notificationId: 1,
    occurredAt: '2026-09-27T18:42:00.000Z',
    capturedAt: '2026-09-27T18:42:01.000Z',
    title: 'Compra con tarjeta',
    body: 'Compra de 18,40 € en MERCADONA',
    merchant: 'MERCADONA',
    amountMinor: 1840,
    currency: 'EUR',
    cardHint: '••••1234',
    kind: 'payment',
    parserConfidence: 1,
    fingerprint: 'fingerprint-1',
    ...overrides,
  };
}

const settings: PaymentDetectionSettings = {
  enabled: true,
  mode: 'automatic',
  autoConfidence: 0.85,
};

it('never lets a perfect parser compensate for a weak single-account guess', () => {
  const weakMatch: PaymentAccountMatch = {
    accountId: 'bankinter-account',
    confidence: 0.62,
    reason: 'only-active-account',
  };
  expect(MIN_AUTOMATIC_ACCOUNT_MATCH_CONFIDENCE).toBeGreaterThan(weakMatch.confidence);
  expect(shouldAutomaticallyApplyPayment(settings, parsed(), weakMatch, NOW)).toBe(false);
});

it('never auto-applies from an Android display-label institution match alone', () => {
  const labelOnlyMatch: PaymentAccountMatch = {
    accountId: 'bankinter-account',
    confidence: 0.99,
    reason: 'institution-name',
  };
  expect(shouldAutomaticallyApplyPayment(settings, parsed(), labelOnlyMatch, NOW)).toBe(false);
});

it('allows a fresh EUR payment with an independently reliable account match', () => {
  const strongMatch: PaymentAccountMatch = {
    accountId: 'bankinter-account',
    confidence: 0.99,
    reason: 'card-link',
  };
  expect(shouldAutomaticallyApplyPayment(settings, parsed(), strongMatch, NOW)).toBe(true);
});

it('allows a previously learned package-only source link when present', () => {
  const learnedSource: PaymentAccountMatch = {
    accountId: 'bankinter-account',
    confidence: 0.96,
    reason: 'source-link',
  };
  expect(shouldAutomaticallyApplyPayment(settings, parsed(), learnedSource, NOW)).toBe(true);
});

it.each([
  [parsed({ currency: 'USD' }), 'foreign currency'],
  [parsed({ kind: 'rejected' }), 'rejected payment'],
  [parsed({ kind: 'hold' }), 'card hold'],
  [parsed({ occurredAt: '2026-09-27T18:00:00.000Z' }), 'stale notification'],
  [parsed({ amountMinor: null }), 'missing amount'],
] as const)('keeps %s review-only (%s)', (event, _reason) => {
  expect(shouldAutomaticallyApplyPayment(
    settings,
    event,
    { accountId: 'bankinter-account', confidence: 0.99, reason: 'card-link' },
    NOW,
  )).toBe(false);
});

it('never auto-applies when detection is disabled or confirmation mode is selected', () => {
  const match: PaymentAccountMatch = {
    accountId: 'bankinter-account',
    confidence: 0.99,
    reason: 'card-link',
  };
  expect(shouldAutomaticallyApplyPayment({ ...settings, enabled: false }, parsed(), match, NOW)).toBe(false);
  expect(shouldAutomaticallyApplyPayment({ ...settings, mode: 'confirm' }, parsed(), match, NOW)).toBe(false);
});
