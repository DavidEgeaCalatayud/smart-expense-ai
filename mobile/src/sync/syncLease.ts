import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

const SYNC_LEASE_KEY = 'sync_runtime_lease';
const SYNC_LEASE_DURATION_MS = 30 * 60 * 1000;
const LEASE_WAIT_INTERVAL_MS = 100;

interface StoredLease {
  token: string;
  expiresAt: number;
}

export interface SyncLease {
  token: string;
  encoded: string;
}

function parseLease(value: string | null): StoredLease | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredLease>;
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAt !== 'number') {
      return null;
    }
    return { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function tryAcquireSyncLease(db: SQLiteDatabase): Promise<SyncLease | null> {
  const now = Date.now();
  const lease: StoredLease = {
    token: Crypto.randomUUID(),
    expiresAt: now + SYNC_LEASE_DURATION_MS,
  };
  const encoded = JSON.stringify(lease);
  let acquired = false;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<{ value: string }>(
      'SELECT value FROM sync_state WHERE key = ?',
      SYNC_LEASE_KEY,
    );
    const current = parseLease(row?.value ?? null);
    if (current && current.expiresAt > now) {
      return;
    }

    await txn.runAsync(
      `INSERT INTO sync_state(key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      SYNC_LEASE_KEY,
      encoded,
      new Date(now).toISOString(),
    );
    acquired = true;
  });

  return acquired ? { token: lease.token, encoded } : null;
}

export async function acquireSyncLease(
  db: SQLiteDatabase,
  timeoutMs: number,
): Promise<SyncLease> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const lease = await tryAcquireSyncLease(db);
    if (lease) {
      return lease;
    }
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for active synchronization to finish');
    }
    await sleep(Math.min(LEASE_WAIT_INTERVAL_MS, Math.max(1, deadline - Date.now())));
  }
}

export async function releaseSyncLease(db: SQLiteDatabase, lease: SyncLease): Promise<void> {
  await db.runAsync(
    'DELETE FROM sync_state WHERE key = ? AND value = ?',
    SYNC_LEASE_KEY,
    lease.encoded,
  );
}
