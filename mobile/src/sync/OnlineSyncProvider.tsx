import { useNetworkState } from 'expo-network';
import { usePathname } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext, type PropsWithChildren, useCallback, useContext,
  useEffect, useMemo, useState,
} from 'react';
import { AppState } from 'react-native';

import { getSharedMobileApiClient } from '../api/client';
import { abortPendingApiRequests } from '../api/fetchWithTimeout';
import { subscribeServerReachability } from '../api/serverReachability';
import { useAuth } from '../auth/AuthProvider';
import { isSessionWorkAllowed, runSessionWork } from '../auth/sessionWork';
import { runForegroundSync, type ForegroundSyncResult } from './foregroundSync';
import { getSyncHealth, type SyncHealth } from './statusRepository';
import { getSyncState, setSyncState } from './stateRepository';
import { SyncClient } from './syncClient';
import { SyncCoordinator } from './SyncCoordinator';

export type ConnectionMode = 'checking' | 'online' | 'offline' | 'unavailable';
interface OnlineSyncValue {
  mode: ConnectionMode;
  hasNetwork: boolean;
  isSyncing: boolean;
  health: SyncHealth;
  lastResult: ForegroundSyncResult | null;
  lastSyncedAt: string | null;
  error: string | null;
  revision: number;
  syncNow(): Promise<void>;
  refreshHealth(): Promise<void>;
}

const EMPTY_HEALTH: SyncHealth = { queued: 0, sending: 0, failed: 0, conflicts: 0 };
const Context = createContext<OnlineSyncValue | null>(null);

export function OnlineSyncProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const { user, isSubmitting } = useAuth();
  const pathname = usePathname();
  const network = useNetworkState();
  const hasNetwork = network.isConnected !== false && network.isInternetReachable !== false;
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [health, setHealth] = useState<SyncHealth>(EMPTY_HEALTH);
  const [lastResult, setLastResult] = useState<ForegroundSyncResult | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const refreshHealth = useCallback(async () => { setHealth(await getSyncHealth(db)); }, [db]);
  const coordinator = useMemo(() => new SyncCoordinator(async () => {
    setIsSyncing(true);
    setError(null);
    try {
      await runSessionWork(async () => {
        const result = await runForegroundSync(db, new SyncClient(getSharedMobileApiClient()));
        const syncedAt = new Date().toISOString();
        await setSyncState(db, 'last_synced_at', syncedAt);
        setLastResult(result);
        setLastSyncedAt(syncedAt);
        setRevision((value) => value + 1);
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not synchronize. Try again.');
      throw reason;
    } finally {
      try { await refreshHealth(); }
      finally { setIsSyncing(false); }
    }
  }, () => isSessionWorkAllowed() && AppState.currentState !== 'background', false),
  [db, refreshHealth]);
  const syncNow = useCallback(() => coordinator.request(), [coordinator]);

  useEffect(() => {
    coordinator.setEnabled(Boolean(user) && !isSubmitting && hasNetwork);
    if (!hasNetwork) abortPendingApiRequests();
    return () => { coordinator.setEnabled(false); };
  }, [coordinator, user, isSubmitting, hasNetwork]);

  useEffect(() => subscribeServerReachability(setReachable), []);
  useEffect(() => {
    let active = true;
    void getSyncState(db, 'last_synced_at').then((value) => { if (active) setLastSyncedAt(value); });
    void getSyncHealth(db).then((value) => { if (active) setHealth(value); });
    return () => { active = false; };
  }, [db, refreshHealth]);

  // Refresh on navigation, reconnect and return to the app without keeping a
  // free server awake with polling or requiring a manual online/offline switch.
  useEffect(() => {
    if (user && !isSubmitting && hasNetwork) void syncNow().catch(() => undefined);
  }, [hasNetwork, isSubmitting, pathname, syncNow, user]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow().catch(() => undefined);
    });
    return () => listener.remove();
  }, [syncNow]);

  const mode: ConnectionMode = !hasNetwork ? 'offline'
    : reachable === false ? 'unavailable' : reachable ? 'online' : 'checking';
  const value = useMemo<OnlineSyncValue>(() => ({
    mode, hasNetwork, isSyncing, health, lastResult, lastSyncedAt, error,
    revision, syncNow, refreshHealth,
  }), [mode, hasNetwork, isSyncing, health, lastResult, lastSyncedAt, error,
    revision, syncNow, refreshHealth]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOnlineSync(): OnlineSyncValue {
  const context = useContext(Context);
  if (!context) throw new Error('useOnlineSync requires OnlineSyncProvider');
  return context;
}
