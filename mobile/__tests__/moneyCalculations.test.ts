import type {
  LocalFinancialAccountRow,
  LocalFinancialAccountSnapshotRow,
} from '../src/database/types';
import {
  historyFromFinancialAccountSnapshots,
  summarizeFinancialAccounts,
} from '../src/features/money/moneyCalculations';

function snapshot(
  id: string,
  accountId: string,
  balanceMinor: number,
  recordedAt: string,
  pending: 0 | 1,
  overrides: Partial<LocalFinancialAccountSnapshotRow> = {},
): LocalFinancialAccountSnapshotRow {
  return {
    id,
    financial_account_id: accountId,
    balance_minor: balanceMinor,
    include_in_net_worth: 1,
    archived: 0,
    recorded_at: recordedAt,
    source: 'manual',
    pending,
    ...overrides,
  };
}

function account(
  id: string,
  balanceMinor: number,
  purpose: LocalFinancialAccountRow['purpose'],
  overrides: Partial<LocalFinancialAccountRow> = {},
): LocalFinancialAccountRow {
  return {
    id,
    name: id,
    institution: null,
    account_type: purpose === 'investment' ? 'broker' : 'checking',
    purpose,
    current_balance_minor: balanceMinor,
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

test('marks a daily net-worth point pending when any account contributing state is pending', () => {
  const points = historyFromFinancialAccountSnapshots([
    snapshot('a-pending', 'account-a', 100_00, '2026-09-27T10:00:00.000Z', 1),
    snapshot('b-synced', 'account-b', 200_00, '2026-09-27T11:00:00.000Z', 0),
  ], Date.parse('2026-09-27T12:00:00.000Z'));

  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({ totalMinor: 300_00, pending: true });
});

test('clears pending only after the latest state of every account is synchronized', () => {
  const points = historyFromFinancialAccountSnapshots([
    snapshot('a-pending', 'account-a', 100_00, '2026-09-27T10:00:00.000Z', 1),
    snapshot('b-synced', 'account-b', 200_00, '2026-09-27T11:00:00.000Z', 0),
    snapshot('a-synced', 'account-a', 110_00, '2026-09-28T10:00:00.000Z', 0),
  ], Date.parse('2026-09-28T12:00:00.000Z'));

  expect(points).toHaveLength(2);
  expect(points[0]).toMatchObject({ totalMinor: 300_00, pending: true });
  expect(points[1]).toMatchObject({ totalMinor: 310_00, pending: false });
});

test('summarizes available reserved and invested money without archived or excluded accounts', () => {
  const summary = summarizeFinancialAccounts([
    account('daily', 150_00, 'daily'),
    account('opportunities', 200_00, 'opportunities'),
    account('investment', 1_000_00, 'investment'),
    account('excluded', 999_00, 'daily', { include_in_net_worth: 0 }),
    account('archived', 888_00, 'savings', { archived: 1 }),
  ]);

  expect(summary.available).toBe(150_00);
  expect(summary.reserved).toBe(200_00);
  expect(summary.invested).toBe(1_000_00);
  expect(summary.total).toBe(1_350_00);
});
