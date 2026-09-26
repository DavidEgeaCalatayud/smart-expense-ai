import type { FinancialAccountSyncPayload } from '@smart-expense-ai/api-contracts';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { LocalFinancialAccountRow } from '../src/database/types';
import { updateOfflineFinancialAccountBalance } from '../src/features/money/offlineFinancialAccountMutations';
import type { OutboxRow } from '../src/sync/outboxRepository';

const randomUUID = jest.fn<string, []>();

jest.mock('expo-crypto', () => ({
  randomUUID: () => randomUUID(),
}));

interface SnapshotRow {
  id: string;
  financial_account_id: string;
  balance_minor: number;
  include_in_net_worth: number;
  archived: number;
  recorded_at: string;
  source: 'manual';
  pending: number;
}

class FakeFinancialAccountDb {
  account: LocalFinancialAccountRow;
  snapshots: SnapshotRow[] = [];
  outbox: OutboxRow | null = null;

  constructor(account: LocalFinancialAccountRow) {
    this.account = account;
  }

  async execAsync(_sql: string): Promise<void> {}

  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    if (sql.includes("status = 'sending'")) return null;
    if (sql.includes('FROM financial_accounts')) {
      return (params[0] === this.account.id ? this.account : null) as T | null;
    }
    if (sql.includes('FROM sync_outbox')) {
      return this.outbox as T | null;
    }
    if (sql.includes('FROM financial_account_snapshots')) {
      const snapshot = this.snapshots.find((item) => item.id === params[0] && item.pending === 1) ?? null;
      return snapshot as T | null;
    }
    throw new Error(`Unexpected getFirstAsync SQL: ${sql}`);
  }

  async runAsync(sql: string, ...params: unknown[]): Promise<void> {
    if (sql.startsWith('UPDATE financial_accounts')) {
      this.account.current_balance_minor = params[0] as number;
      this.account.balance_updated_at = params[1] as string;
      this.account.sync_status = 'pending';
      this.account.updated_at = params[2] as string;
      return;
    }

    if (sql.startsWith('INSERT INTO financial_account_snapshots')) {
      this.snapshots.push({
        id: params[0] as string,
        financial_account_id: params[1] as string,
        balance_minor: params[2] as number,
        include_in_net_worth: params[3] as number,
        archived: params[4] as number,
        recorded_at: params[5] as string,
        source: 'manual',
        pending: 1,
      });
      return;
    }

    if (sql.startsWith('INSERT INTO sync_outbox')) {
      this.outbox = {
        sequence: 1,
        mutation_id: params[0] as string,
        entity_type: 'financial_account',
        entity_id: params[2] as string,
        operation: 'upsert',
        base_version: params[4] as number,
        payload_json: params[5] as string,
        client_occurred_at: params[6] as string,
        status: 'queued',
        attempt_count: 0,
        last_error: null,
        created_at: params[7] as string,
        updated_at: params[8] as string,
      };
      return;
    }

    if (sql.startsWith('UPDATE sync_outbox')) {
      if (!this.outbox) throw new Error('Expected an existing outbox row');
      this.outbox.payload_json = params[0] as string;
      this.outbox.status = 'queued';
      this.outbox.last_error = null;
      this.outbox.client_occurred_at = params[1] as string;
      this.outbox.updated_at = params[2] as string;
      return;
    }

    throw new Error(`Unexpected runAsync SQL: ${sql}`);
  }
}

describe('offline financial account history', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    randomUUID.mockReset();
    randomUUID
      .mockReturnValueOnce('snapshot-1100')
      .mockReturnValueOnce('mutation-account-1')
      .mockReturnValueOnce('snapshot-1200')
      .mockReturnValueOnce('snapshot-1500');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps every balance observation while coalescing the final account state', async () => {
    const db = new FakeFinancialAccountDb({
      id: 'account-1',
      name: 'Trade Republic',
      institution: 'Trade Republic',
      account_type: 'broker',
      purpose: 'opportunities',
      current_balance_minor: 100_000,
      currency: 'EUR',
      include_in_net_worth: 1,
      archived: 0,
      balance_updated_at: '2026-09-19T10:00:00.000Z',
      server_version: 4,
      sync_status: 'synced',
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-19T10:00:00.000Z',
    });
    const sqlite = db as unknown as SQLiteDatabase;

    jest.setSystemTime(new Date('2026-09-20T10:00:00.000Z'));
    await updateOfflineFinancialAccountBalance(sqlite, 'account-1', '1100.00');
    jest.setSystemTime(new Date('2026-09-22T10:00:00.000Z'));
    await updateOfflineFinancialAccountBalance(sqlite, 'account-1', '1200.00');
    jest.setSystemTime(new Date('2026-09-24T10:00:00.000Z'));
    await updateOfflineFinancialAccountBalance(sqlite, 'account-1', '1500.00');

    expect(db.snapshots).toHaveLength(3);
    expect(db.outbox).not.toBeNull();
    const payload = JSON.parse(db.outbox!.payload_json!) as FinancialAccountSyncPayload;

    expect(payload.historyBase).toEqual({
      currentBalance: '1000.00',
      includeInNetWorth: true,
      archived: false,
    });
    expect(payload.currentBalance).toBe('1500.00');
    expect(payload.balanceSnapshotId).toBe('snapshot-1500');
    expect(payload.balanceObservations).toEqual([
      {
        id: 'snapshot-1100',
        balance: '1100.00',
        includeInNetWorth: true,
        archived: false,
        recordedAt: '2026-09-20T10:00:00.000Z',
        source: 'manual',
      },
      {
        id: 'snapshot-1200',
        balance: '1200.00',
        includeInNetWorth: true,
        archived: false,
        recordedAt: '2026-09-22T10:00:00.000Z',
        source: 'manual',
      },
      {
        id: 'snapshot-1500',
        balance: '1500.00',
        includeInNetWorth: true,
        archived: false,
        recordedAt: '2026-09-24T10:00:00.000Z',
        source: 'manual',
      },
    ]);
  });
});
