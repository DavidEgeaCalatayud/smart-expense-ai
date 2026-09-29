import { paymentEventIgnoreError } from '../src/features/paymentDetection/eventPolicy';
import type { ObservedPaymentEventRow } from '../src/features/paymentDetection/types';

function event(overrides: Partial<ObservedPaymentEventRow> = {}): ObservedPaymentEventRow {
  return {
    id: 'event-1',
    source_package: 'com.bankinter.launcher',
    source_label: 'Bankinter',
    notification_key: 'notification-1',
    notification_id: 1,
    occurred_at: '2026-09-27T18:42:00.000Z',
    captured_at: '2026-09-27T18:42:01.000Z',
    title: 'Compra',
    body: '18,40 € en MERCADONA',
    merchant: 'MERCADONA',
    amount_minor: 1840,
    currency: 'EUR',
    card_hint: '••••1234',
    event_kind: 'payment',
    financial_account_id: 'bankinter-account',
    transaction_id: null,
    confidence: 0.95,
    status: 'needs_confirmation',
    fingerprint: null,
    error_message: null,
    created_at: '2026-09-27T18:42:01.000Z',
    updated_at: '2026-09-27T18:42:01.000Z',
    ...overrides,
  };
}

test('allows ignoring an untouched detected event', () => {
  expect(paymentEventIgnoreError(event())).toBeNull();
});

test('blocks ignoring an event after its transaction has already been created', () => {
  expect(paymentEventIgnoreError(event({
    status: 'balance_pending',
    transaction_id: 'transaction-1',
  }))).toContain('ya creó una transacción');
});

test('blocks ignoring an already-applied event', () => {
  expect(paymentEventIgnoreError(event({
    status: 'applied',
    transaction_id: 'transaction-1',
  }))).toContain('ya fue aplicado');
});
