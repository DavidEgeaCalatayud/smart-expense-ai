import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { MobileApiClient } from '../api/client';
import { getMobileApiBaseUrl } from '../api/config';
import { runForegroundSync, type ForegroundSyncResult } from './foregroundSync';
import { getSyncHealth, type SyncHealth } from './statusRepository';
import { SyncClient } from './syncClient';

const EMPTY_HEALTH: SyncHealth = {
  queued: 0,
  sending: 0,
  failed: 0,
  conflicts: 0,
};

function syncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Synchronization failed';
}

export function useForegroundSync(onApplied?: () => Promise<void> | void) {
  const db = useSQLiteContext();
  const syncClient = useMemo(
    () => new SyncClient(new MobileApiClient(getMobileApiBaseUrl())),
    [],
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [health, setHealth] = useState<SyncHealth>(EMPTY_HEALTH);
  const [lastResult, setLastResult] = useState<ForegroundSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshHealth = useCallback(async () => {
    setHealth(await getSyncHealth(db));
  }, [db]);

  const syncNow = useCallback(async () => {
    if (isSyncing) {
      return;
    }
    setIsSyncing(true);
    setError(null);
    try {
      const result = await runForegroundSync(db, syncClient);
      setLastResult(result);
      await refreshHealth();
      await onApplied?.();
    } catch (caught) {
      setError(syncErrorMessage(caught));
      await refreshHealth();
      throw caught;
    } finally {
      setIsSyncing(false);
    }
  }, [db, isSyncing, onApplied, refreshHealth, syncClient]);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    void syncNow().catch(() => {
      // Offline/transient failures are rendered as state and keep the local replica usable.
    });
    // Run once for this mounted authenticated workspace; manual sync handles later retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isSyncing,
    health,
    lastResult,
    error,
    syncNow,
    refreshHealth,
  };
}
