import type { SQLiteDatabase } from 'expo-sqlite';

import {
  enrichObservedPaymentEventFromDuplicate,
  findLikelyDuplicateEvent,
} from '../src/features/paymentDetection/repository';
import type {
  ObservedPaymentEventRow,
  ParsedPaymentNotification,
  PaymentAccountMatch,
} from '../src/features/paymentDetection/types';

function parsed(overrides: Partial<ParsedPaymentNotification> = {}): ParsedPaymentNotification {
  return {
    sourcePackage: 'com.google.android.apps.walletnfcrel',
    sourceLabel: 'Google Wallet',
    notificationKey: 'wallet-new',
    notificationId: 1,
    occurredAt: '2026-09-27T18:42:00.000Z',
    capturedAt: '2026-09-27T18:42:01.000Z',
    title: 'MERCADONA',
    body: '18,40 € · Visa ••••1234',
    merchant: 'MERCADONA',
    amountMinor: 1840,
    currency: 'EUR',
    cardHint: '••••1234',
    kind: 'payment',
    parserConfidence: 0.95,
    fingerprint: null,
    ...overrides,
  };
}

function existing(overrides: Partial<ObservedPaymentEventRow> = {}): ObservedPaymentEventRow {
  return {
    id: 'existing-event',
    source_package: 'com.bankinter.launcher',
    source_label: 'Bankinter',
    notification_key: 'bank-1',
    notification_id: 2,
    occurred_at: '2026-09-27T18:42:30.000Z',
    captured_at: '2026-09-27T18:42:31.000Z',
    title: 'Compra con tarjeta',
    body: '18,40 € en MERCADONA',
    merchant: 'MERCADONA',
    amount_minor: 1840,
    currency: 'EUR',
    card_hint: '••••1234',
    event_kind: 'payment',
    financial_account_id: 'bankinter-account',
    transaction_id: null,
    confidence: 0.98,
    status: 'applied',
    fingerprint: null,
    error_message: null,
    created_at: '2026-09-27T18:42:31.000Z',
    updated_at: '2026-09-27T18:42:31.000Z',
    ...overrides,
  };
}

function fakeDb(rows: ObservedPaymentEventRow[]) {
  let sql = '';
  const runAsync = jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 }));
  const db = {
    getAllAsync: jest.fn(async (query: string) => {
      sql = query;
      return rows;
    }),
    runAsync,
  } as unknown as SQLiteDatabase;
  return { db, sql: () => sql, runAsync };
}

test('keeps failed events with an already-created transaction in the dedupe candidate set', async () => {
  const partialFailure = existing({ status: 'failed', transaction_id: 'transaction-1' });
  const fake = fakeDb([partialFailure]);
  const duplicate = await findLikelyDuplicateEvent(fake.db, parsed());

  expect(fake.sql()).toContain("status NOT IN ('ignored', 'rejected')");
  expect(fake.sql()).toContain("status <> 'failed' OR transaction_id IS NOT NULL");
  expect(duplicate?.id).toBe(partialFailure.id);
});

test('deduplicates Wallet and bank notifications for the same merchant and amount', async () => {
  const fake = fakeDb([existing()]);
  expect((await findLikelyDuplicateEvent(fake.db, parsed()))?.id).toBe('existing-event');
});

test('does not collapse two sparse same-value notifications from the same source just because the card matches', async () => {
  const sparseExisting = existing({
    source_package: 'com.google.android.apps.walletnfcrel',
    merchant: null,
  });
  const fake = fakeDb([sparseExisting]);
  const duplicate = await findLikelyDuplicateEvent(fake.db, parsed({ merchant: null }));
  expect(duplicate).toBeNull();
});

test('uses same-card evidence only across different sources and within a tight time window', async () => {
  const sparseBank = existing({ merchant: null, occurred_at: '2026-09-27T18:42:45.000Z' });
  const fake = fakeDb([sparseBank]);
  expect((await findLikelyDuplicateEvent(fake.db, parsed({ merchant: null })))?.id).toBe('existing-event');

  const oldFake = fakeDb([existing({ merchant: null, occurred_at: '2026-09-27T18:39:00.000Z' })]);
  expect(await findLikelyDuplicateEvent(oldFake.db, parsed({ merchant: null }))).toBeNull();
});

test('never deduplicates different movement kinds with the same amount', async () => {
  const fake = fakeDb([existing({ event_kind: 'refund' })]);
  expect(await findLikelyDuplicateEvent(fake.db, parsed())).toBeNull();
});

test('enriches a sparse Wallet canonical event with later bank evidence', async () => {
  const canonical = existing({
    source_package: 'com.google.android.apps.walletnfcrel',
    source_label: 'Google Wallet',
    merchant: null,
    card_hint: null,
    financial_account_id: null,
    confidence: 0.55,
    status: 'needs_confirmation',
  });
  const incoming = parsed({
    sourcePackage: 'com.bankinter.launcher',
    sourceLabel: 'Bankinter',
    merchant: 'MERCADONA',
    cardHint: '••••1234',
    parserConfidence: 0.95,
  });
  const match: PaymentAccountMatch = {
    accountId: 'bankinter-account',
    confidence: 0.92,
    reason: 'institution-name',
  };
  const fake = fakeDb([]);

  await enrichObservedPaymentEventFromDuplicate(fake.db, canonical, incoming, match);

  expect(fake.runAsync).toHaveBeenCalledTimes(1);
  const [, merchant, cardHint, accountId, confidence, , eventId] = fake.runAsync.mock.calls[0]!;
  expect(merchant).toBe('MERCADONA');
  expect(cardHint).toBe('••••1234');
  expect(accountId).toBe('bankinter-account');
  expect(confidence).toBeGreaterThan(canonical.confidence);
  expect(eventId).toBe(canonical.id);
});

test('duplicate evidence never overwrites an account already chosen for the canonical event', async () => {
  const canonical = existing({
    financial_account_id: 'user-selected-account',
    confidence: 0.7,
    status: 'needs_confirmation',
  });
  const fake = fakeDb([]);
  await enrichObservedPaymentEventFromDuplicate(
    fake.db,
    canonical,
    parsed({ sourcePackage: 'com.other.bank', sourceLabel: 'Other Bank' }),
    { accountId: 'different-account', confidence: 0.99, reason: 'card-link' },
  );

  const [, , , accountId] = fake.runAsync.mock.calls[0]!;
  expect(accountId).toBe('user-selected-account');
});

test.each(['applied', 'ignored', 'rejected'] as const)(
  'does not mutate a canonical event once its decision is final: %s',
  async (status) => {
    const fake = fakeDb([]);
    await enrichObservedPaymentEventFromDuplicate(
      fake.db,
      existing({ status }),
      parsed(),
      { accountId: 'bankinter-account', confidence: 0.99, reason: 'card-link' },
    );
    expect(fake.runAsync).not.toHaveBeenCalled();
  },
);
