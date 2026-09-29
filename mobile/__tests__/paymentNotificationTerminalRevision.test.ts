import type { SQLiteDatabase } from 'expo-sqlite';

import {
  findLikelyDuplicateEvent,
  findObservedEventByNotificationGroup,
} from '../src/features/paymentDetection/repository';
import type {
  ObservedPaymentEventRow,
  ParsedPaymentNotification,
} from '../src/features/paymentDetection/types';

function existing(overrides: Partial<ObservedPaymentEventRow> = {}): ObservedPaymentEventRow {
  return {
    id: 'event-1',
    source_package: 'com.bankinter.launcher',
    source_label: 'Bankinter',
    notification_key: 'payment-key#rev=paid',
    notification_id: 7,
    occurred_at: '2026-09-27T18:42:00.000Z',
    captured_at: '2026-09-27T18:42:01.000Z',
    title: 'Pago realizado',
    body: 'Pago de 18,40 € en MERCADONA',
    merchant: 'MERCADONA',
    amount_minor: 1840,
    currency: 'EUR',
    card_hint: '••••1234',
    event_kind: 'payment',
    financial_account_id: 'account-1',
    transaction_id: 'transaction-1',
    confidence: 0.98,
    status: 'applied',
    fingerprint: null,
    error_message: null,
    created_at: '2026-09-27T18:42:01.000Z',
    updated_at: '2026-09-27T18:42:01.000Z',
    ...overrides,
  };
}

function incoming(overrides: Partial<ParsedPaymentNotification> = {}): ParsedPaymentNotification {
  return {
    sourcePackage: 'com.bankinter.launcher',
    sourceLabel: 'Bankinter',
    notificationKey: 'payment-key#rev=refunded',
    notificationId: 7,
    occurredAt: '2026-09-27T18:43:00.000Z',
    capturedAt: '2026-09-27T18:43:01.000Z',
    title: 'Cargo devuelto',
    body: 'Cargo devuelto de 18,40 € en MERCADONA',
    merchant: 'MERCADONA',
    amountMinor: 1840,
    currency: 'EUR',
    cardHint: '••••1234',
    kind: 'refund',
    parserConfidence: 0.98,
    fingerprint: null,
    ...overrides,
  };
}

function fakeDb(rows: ObservedPaymentEventRow[]): SQLiteDatabase {
  return {
    getAllAsync: jest.fn(async () => rows),
  } as unknown as SQLiteDatabase;
}

test('does not swallow a refund revision after the original payment already created financial state', async () => {
  const db = fakeDb([existing()]);
  const revisionMatch = await findObservedEventByNotificationGroup(db, incoming());
  const duplicateMatch = await findLikelyDuplicateEvent(db, incoming());

  // Both matching layers must release the reversal so ingestion creates a new compensating event.
  expect(revisionMatch).toBeNull();
  expect(duplicateMatch).toBeNull();
});

test('still collapses cosmetic same-kind revisions after an applied payment', async () => {
  const original = existing();
  const revised = incoming({
    notificationKey: 'payment-key#rev=merchant-detail',
    title: 'Pago realizado',
    body: 'Pago de 18,40 € en MERCADONA SUPERMERCADO',
    kind: 'payment',
  });
  const db = fakeDb([original]);
  const revisionMatch = await findObservedEventByNotificationGroup(db, revised);
  const duplicateMatch = await findLikelyDuplicateEvent(db, revised);

  expect(revisionMatch?.id).toBe(original.id);
  expect(duplicateMatch?.id).toBe(original.id);
});

test('still reconciles a mutable hold into its later successful payment', async () => {
  const hold = existing({
    notification_key: 'payment-key#rev=hold',
    event_kind: 'hold',
    transaction_id: null,
    status: 'needs_confirmation',
  });
  const match = await findObservedEventByNotificationGroup(
    fakeDb([hold]),
    incoming({
      notificationKey: 'payment-key#rev=completed',
      title: 'Pago realizado',
      kind: 'payment',
    }),
  );

  expect(match?.id).toBe(hold.id);
});
