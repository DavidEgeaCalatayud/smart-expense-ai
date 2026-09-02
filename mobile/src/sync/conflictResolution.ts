import type {
  BudgetSyncPayload,
  CategorySyncPayload,
  SyncChange,
  SyncMutation,
  TransactionSyncPayload,
} from '@smart-expense-ai/api-contracts';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../database/keyedTransaction';
import { applySyncChange } from './applyChanges';
import {
  getUnresolvedConflict,
  markConflictResolved,
  type StoredConflictRow,
} from './conflictRepository';
import { enqueueMutation } from './outboxRepository';

const TABLE_BY_ENTITY = {
  transaction: 'transactions',
  category: 'categories',
  budget: 'budgets',
} as const;

function serverChangeFromConflict(conflict: StoredConflictRow): SyncChange {
  const changedAt = new Date().toISOString();
  const version = conflict.server_version ?? 1;

  if (conflict.server_payload_json === null) {
    return {
      cursor: 'conflict-resolution',
      entityType: conflict.entity_type,
      entityId: conflict.entity_id,
      operation: 'delete',
      version,
      changedAt,
      payload: null,
    };
  }

  const payload = JSON.parse(conflict.server_payload_json) as unknown;
  switch (conflict.entity_type) {
    case 'transaction':
      return {
        cursor: 'conflict-resolution',
        entityType: 'transaction',
        entityId: conflict.entity_id,
        operation: 'upsert',
        version,
        changedAt,
        payload: payload as TransactionSyncPayload,
      };
    case 'category':
      return {
        cursor: 'conflict-resolution',
        entityType: 'category',
        entityId: conflict.entity_id,
        operation: 'upsert',
        version,
        changedAt,
        payload: payload as CategorySyncPayload,
      };
    case 'budget':
      return {
        cursor: 'conflict-resolution',
        entityType: 'budget',
        entityId: conflict.entity_id,
        operation: 'upsert',
        version,
        changedAt,
        payload: payload as BudgetSyncPayload,
      };
  }
}

function retryMutationFromConflict(conflict: StoredConflictRow): SyncMutation {
  if (conflict.server_version === null || conflict.local_payload_json === null) {
    throw new Error('This conflict cannot safely retry the local value');
  }
  const metadata = {
    mutationId: Crypto.randomUUID(),
    entityId: conflict.entity_id,
    baseVersion: conflict.server_version,
    clientOccurredAt: new Date().toISOString(),
  };
  const payload = JSON.parse(conflict.local_payload_json) as unknown;

  switch (conflict.entity_type) {
    case 'transaction':
      return {
        ...metadata,
        entityType: 'transaction',
        operation: 'upsert',
        payload: payload as TransactionSyncPayload,
      };
    case 'category':
      return {
        ...metadata,
        entityType: 'category',
        operation: 'upsert',
        payload: payload as CategorySyncPayload,
      };
    case 'budget':
      return {
        ...metadata,
        entityType: 'budget',
        operation: 'upsert',
        payload: payload as BudgetSyncPayload,
      };
  }
}

export async function resolveConflictWithServer(
  db: SQLiteDatabase,
  conflictId: number,
): Promise<void> {
  const conflict = await getUnresolvedConflict(db, conflictId);
  if (!conflict) {
    return;
  }
  await runKeyedTransaction(db, async (txn) => {
    await applySyncChange(txn, serverChangeFromConflict(conflict), { force: true });
    await markConflictResolved(txn, conflictId);
  });
}

export async function retryConflictWithLocalValue(
  db: SQLiteDatabase,
  conflictId: number,
): Promise<void> {
  const conflict = await getUnresolvedConflict(db, conflictId);
  if (!conflict) {
    return;
  }
  if (conflict.reason !== 'stale_version') {
    throw new Error('Only stale-version conflicts can safely retry the local value');
  }
  const mutation = retryMutationFromConflict(conflict);
  const now = new Date().toISOString();

  await runKeyedTransaction(db, async (txn) => {
    await txn.runAsync(
      `UPDATE ${TABLE_BY_ENTITY[conflict.entity_type]}
       SET sync_status = 'pending', server_version = ?, updated_at = ?
       WHERE id = ?`,
      conflict.server_version,
      now,
      conflict.entity_id,
    );
    await enqueueMutation(txn, mutation, now);
    await markConflictResolved(txn, conflictId);
  });
}
