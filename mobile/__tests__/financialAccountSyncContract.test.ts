import { outboxRowToMutation, type OutboxRow } from '../src/sync/outboxRepository';

function accountRow(payload: Record<string, unknown>): OutboxRow {
  return {
    sequence: 9,
    mutation_id: 'mutation-money-1',
    entity_type: 'financial_account',
    entity_id: 'account-1',
    operation: 'upsert',
    base_version: 4,
    payload_json: JSON.stringify(payload),
    client_occurred_at: '2026-09-26T18:00:00.000Z',
    status: 'queued',
    attempt_count: 0,
    last_error: null,
    created_at: '2026-09-26T18:00:00.000Z',
    updated_at: '2026-09-26T18:00:00.000Z',
  };
}

describe('financial account sync contract', () => {
  it('preserves exact decimal money and the canonical snapshot id', () => {
    const mutation = outboxRowToMutation(accountRow({
      name: 'Trade Republic',
      institution: 'Trade Republic',
      accountType: 'broker',
      purpose: 'opportunities',
      currentBalance: '1250.00',
      currency: 'EUR',
      includeInNetWorth: true,
      archived: false,
      balanceUpdatedAt: '2026-09-26T18:00:00.000Z',
      balanceSnapshotId: 'snapshot-1250',
    }));

    expect(mutation).toEqual({
      mutationId: 'mutation-money-1',
      entityId: 'account-1',
      entityType: 'financial_account',
      operation: 'upsert',
      baseVersion: 4,
      clientOccurredAt: '2026-09-26T18:00:00.000Z',
      payload: {
        name: 'Trade Republic',
        institution: 'Trade Republic',
        accountType: 'broker',
        purpose: 'opportunities',
        currentBalance: '1250.00',
        currency: 'EUR',
        includeInNetWorth: true,
        archived: false,
        balanceUpdatedAt: '2026-09-26T18:00:00.000Z',
        balanceSnapshotId: 'snapshot-1250',
      },
    });
  });

  it('keeps metadata-only account mutations snapshot-free', () => {
    const mutation = outboxRowToMutation(accountRow({
      name: 'Bankinter',
      institution: 'Bankinter',
      accountType: 'savings',
      purpose: 'emergency_fund',
      currentBalance: '3000.00',
      currency: 'EUR',
      includeInNetWorth: true,
      archived: false,
      balanceUpdatedAt: '2026-09-26T18:00:00.000Z',
      balanceSnapshotId: null,
    }));

    expect(mutation.entityType).toBe('financial_account');
    expect(mutation.operation).toBe('upsert');
    if (mutation.entityType === 'financial_account' && mutation.operation === 'upsert') {
      expect(mutation.payload.balanceSnapshotId).toBeNull();
      expect(mutation.payload.currentBalance).toBe('3000.00');
    }
  });
});
