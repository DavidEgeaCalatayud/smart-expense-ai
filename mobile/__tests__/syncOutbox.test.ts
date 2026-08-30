import { outboxRowToMutation, type OutboxRow } from '../src/sync/outboxRepository';

function row(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    sequence: 1,
    mutation_id: 'mutation-1',
    entity_type: 'transaction',
    entity_id: 'entity-1',
    operation: 'upsert',
    base_version: 3,
    payload_json: JSON.stringify({
      merchant: 'Market',
      description: '',
      categoryId: 'category-1',
      amount: '12.34',
      currency: 'EUR',
      transactionDate: '2026-08-30',
      transactionType: 'expense',
      paymentMethod: 'card',
      isRecurring: false,
      source: 'manual',
    }),
    client_occurred_at: '2026-08-30T18:00:00.000Z',
    status: 'queued',
    attempt_count: 0,
    last_error: null,
    created_at: '2026-08-30T18:00:00.000Z',
    updated_at: '2026-08-30T18:00:00.000Z',
    ...overrides,
  };
}

describe('outboxRowToMutation', () => {
  it('reconstructs an exact transaction upsert', () => {
    const mutation = outboxRowToMutation(row());

    expect(mutation).toEqual({
      mutationId: 'mutation-1',
      entityId: 'entity-1',
      entityType: 'transaction',
      operation: 'upsert',
      baseVersion: 3,
      clientOccurredAt: '2026-08-30T18:00:00.000Z',
      payload: {
        merchant: 'Market',
        description: '',
        categoryId: 'category-1',
        amount: '12.34',
        currency: 'EUR',
        transactionDate: '2026-08-30',
        transactionType: 'expense',
        paymentMethod: 'card',
        isRecurring: false,
        source: 'manual',
      },
    });
  });

  it('reconstructs delete tombstones without a payload', () => {
    const mutation = outboxRowToMutation(
      row({
        entity_type: 'budget',
        operation: 'delete',
        payload_json: null,
        base_version: 8,
      }),
    );

    expect(mutation).toEqual({
      mutationId: 'mutation-1',
      entityId: 'entity-1',
      entityType: 'budget',
      operation: 'delete',
      baseVersion: 8,
      clientOccurredAt: '2026-08-30T18:00:00.000Z',
    });
  });

  it('rejects corrupt upsert rows with no payload', () => {
    expect(() => outboxRowToMutation(row({ payload_json: null }))).toThrow(
      'is missing its upsert payload',
    );
  });
});
