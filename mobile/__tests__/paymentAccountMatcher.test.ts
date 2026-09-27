import type { SQLiteDatabase } from 'expo-sqlite';

import { matchPaymentAccount } from '../src/features/paymentDetection/accountMatcher';
import type { LocalFinancialAccountRow } from '../src/database/types';
import type { ParsedPaymentNotification } from '../src/features/paymentDetection/types';

function event(overrides: Partial<ParsedPaymentNotification> = {}): ParsedPaymentNotification {
  return {
    sourcePackage: 'com.bankinter.launcher',
    sourceLabel: 'Bankinter',
    notificationKey: 'notification-1',
    notificationId: 1,
    occurredAt: '2026-09-27T18:42:00.000Z',
    capturedAt: '2026-09-27T18:42:01.000Z',
    title: 'Compra',
    body: '18,40 €',
    merchant: null,
    amountMinor: 1840,
    currency: 'EUR',
    cardHint: null,
    kind: 'payment',
    parserConfidence: 0.8,
    fingerprint: null,
    ...overrides,
  };
}

function account(id: string, overrides: Partial<LocalFinancialAccountRow> = {}): LocalFinancialAccountRow {
  return {
    id,
    name: id,
    institution: 'Bankinter',
    account_type: 'checking',
    purpose: 'daily',
    current_balance_minor: 100_00,
    currency: 'EUR',
    include_in_net_worth: 1,
    archived: 0,
    balance_updated_at: '2026-09-27T10:00:00.000Z',
    server_version: 1,
    sync_status: 'synced',
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-27T10:00:00.000Z',
    ...overrides,
  };
}

function dbWith(accounts: LocalFinancialAccountRow[], links: Array<{ financial_account_id: string } | null> = [null, null]) {
  let linkIndex = 0;
  const queries: string[] = [];
  const db = {
    getFirstAsync: jest.fn(async (sql: string) => {
      queries.push(sql);
      return links[linkIndex++] ?? null;
    }),
    getAllAsync: jest.fn(async () => accounts),
  } as unknown as SQLiteDatabase;
  return { db, queries };
}

test('does not guess between two accounts from the same institution', async () => {
  const fake = dbWith([
    account('bankinter-main', { name: 'Principal' }),
    account('bankinter-savings', { name: 'Ahorro', account_type: 'savings', purpose: 'savings' }),
  ]);
  const match = await matchPaymentAccount(fake.db, event());
  expect(match).toEqual({ accountId: null, confidence: 0, reason: 'ambiguous-institution' });
});

test('uses a learned card link before institution-name matching', async () => {
  const fake = dbWith(
    [account('bankinter-main'), account('bankinter-savings')],
    [{ financial_account_id: 'bankinter-savings' }],
  );
  const match = await matchPaymentAccount(fake.db, event({ cardHint: '••••1234' }));
  expect(match).toEqual({ accountId: 'bankinter-savings', confidence: 0.99, reason: 'card-link' });
  expect(fake.queries[0]).toContain('account.archived = 0');
  expect(fake.queries[0]).toContain('account.include_in_net_worth = 1');
});

test('keeps the sole-account fallback deliberately below automatic confidence', async () => {
  const fake = dbWith([
    account('only-account', { institution: 'Another Bank', name: 'Main account' }),
  ]);
  const match = await matchPaymentAccount(fake.db, event({ sourceLabel: 'Unknown wallet' }));
  expect(match.accountId).toBe('only-account');
  expect(match.reason).toBe('only-active-account');
  expect(match.confidence).toBe(0.62);
});

test('selects one clearly stronger institution match when the runner-up is not close', async () => {
  const fake = dbWith([
    account('exact', { institution: 'Bankinter', name: 'Principal' }),
    account('partial', { institution: 'Bankinter Consumer Finance', name: 'Otra' }),
  ]);
  const match = await matchPaymentAccount(fake.db, event());
  expect(match.accountId).toBe('exact');
  expect(match.confidence).toBe(0.92);
});
