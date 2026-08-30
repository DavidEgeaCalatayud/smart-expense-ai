import { MOBILE_SYNC_PROTOCOL_VERSION } from '@smart-expense-ai/api-contracts';
import type { SQLiteDatabase } from 'expo-sqlite';

import { MobileApiHttpError } from '../api/client';
import { getOrCreateDeviceId } from '../auth/deviceIdentity';
import { applyBootstrapPage, applyChangesAndCursor } from './applyChanges';
import {
  listPendingMutations,
  markMutationsSending,
  outboxRowToMutation,
  requeueMutations,
  resetInterruptedMutations,
} from './outboxRepository';
import { persistPushResponse } from './pushOutcomes';
import { getSyncState } from './stateRepository';
import { SyncClient } from './syncClient';

const PUSH_BATCH_SIZE = 50;
const PAGE_SIZE = 100;
const MAX_TRANSIENT_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [250, 750] as const;

export interface ForegroundSyncResult {
  pushedMutations: number;
  pulledChanges: number;
  bootstrapChanges: number;
  cursor: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown synchronization error';
}

function isTransient(error: unknown): boolean {
  if (error instanceof MobileApiHttpError) {
    return error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withTransientRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === MAX_TRANSIENT_ATTEMPTS - 1) {
        throw error;
      }
      const baseDelay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 750;
      const jitter = Math.floor(Math.random() * 100);
      await sleep(baseDelay + jitter);
    }
  }
  throw lastError;
}

async function pushOutbox(
  db: SQLiteDatabase,
  client: SyncClient,
  deviceId: string,
): Promise<number> {
  let pushed = 0;

  while (true) {
    const rows = await listPendingMutations(db, PUSH_BATCH_SIZE);
    if (rows.length === 0) {
      return pushed;
    }

    const mutationIds = rows.map((row) => row.mutation_id);
    await markMutationsSending(db, mutationIds);

    try {
      const response = await withTransientRetry(() =>
        client.push({
          protocolVersion: MOBILE_SYNC_PROTOCOL_VERSION,
          deviceId,
          mutations: rows.map(outboxRowToMutation),
        }),
      );
      await persistPushResponse(db, rows, response);
      pushed += rows.length;
    } catch (error) {
      await requeueMutations(db, mutationIds, errorMessage(error));
      throw error;
    }
  }
}

async function bootstrapReplica(db: SQLiteDatabase, client: SyncClient): Promise<{
  cursor: string;
  changes: number;
}> {
  let snapshotToken: string | null = null;
  let pageToken: string | null = null;
  let totalChanges = 0;

  while (true) {
    const page = await withTransientRetry(() =>
      client.bootstrap({
        limit: PAGE_SIZE,
        snapshotToken,
        pageToken,
      }),
    );
    await applyBootstrapPage(db, page.changes);
    totalChanges += page.changes.length;
    snapshotToken = page.snapshotToken;

    if (!page.nextPageToken) {
      if (!page.establishedCursor) {
        throw new Error('Sync bootstrap completed without an established cursor');
      }
      await applyChangesAndCursor(db, [], page.establishedCursor);
      return { cursor: page.establishedCursor, changes: totalChanges };
    }
    pageToken = page.nextPageToken;
  }
}

async function pullDeltas(
  db: SQLiteDatabase,
  client: SyncClient,
  initialCursor: string,
): Promise<{ cursor: string; changes: number }> {
  let cursor = initialCursor;
  let totalChanges = 0;

  while (true) {
    const page = await withTransientRetry(() => client.pull(cursor, PAGE_SIZE));
    await applyChangesAndCursor(db, page.changes, page.nextCursor);
    cursor = page.nextCursor;
    totalChanges += page.changes.length;
    if (!page.hasMore) {
      return { cursor, changes: totalChanges };
    }
  }
}

export async function runForegroundSync(
  db: SQLiteDatabase,
  client: SyncClient,
): Promise<ForegroundSyncResult> {
  await resetInterruptedMutations(db);
  const deviceId = await getOrCreateDeviceId();
  const pushedMutations = await pushOutbox(db, client, deviceId);

  let cursor = await getSyncState(db, 'sync_cursor');
  let bootstrapChanges = 0;
  if (!cursor) {
    const bootstrap = await bootstrapReplica(db, client);
    cursor = bootstrap.cursor;
    bootstrapChanges = bootstrap.changes;
  }

  try {
    const pulled = await pullDeltas(db, client, cursor);
    return {
      pushedMutations,
      pulledChanges: pulled.changes,
      bootstrapChanges,
      cursor: pulled.cursor,
    };
  } catch (error) {
    if (
      error instanceof MobileApiHttpError &&
      (error.code === 'invalid_sync_cursor' || error.code === 'sync_cursor_expired')
    ) {
      await db.runAsync("DELETE FROM sync_state WHERE key = 'sync_cursor'");
      const bootstrap = await bootstrapReplica(db, client);
      const pulled = await pullDeltas(db, client, bootstrap.cursor);
      return {
        pushedMutations,
        pulledChanges: pulled.changes,
        bootstrapChanges: bootstrapChanges + bootstrap.changes,
        cursor: pulled.cursor,
      };
    }
    throw error;
  }
}
