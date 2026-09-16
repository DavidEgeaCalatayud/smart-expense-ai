import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { runSessionWork } from '../auth/sessionWork';
import { readServerCache, writeServerCache } from '../database/serverCacheRepository';
import { useOnlineSync } from '../sync/OnlineSyncProvider';
import { MobileApiHttpError } from './client';

function messageFromError(error: unknown): string {
  return error instanceof MobileApiHttpError ? error.message : 'Unable to refresh this section. Try again shortly.';
}

export function useCachedServerResource<T>(cacheKey: string, loader: () => Promise<T>) {
  const db = useSQLiteContext();
  const { hasNetwork, revision, syncNow } = useOnlineSync();
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [isCachedFallback, setIsCachedFallback] = useState(false);
  const [loadedRevision, setLoadedRevision] = useState(-1);
  const generation = useRef(0);
  const currentKey = useRef(cacheKey);
  useEffect(() => { currentKey.current = cacheKey; }, [cacheKey]);

  const load = useCallback(async () => {
    const requestId = ++generation.current;
    const current = () => requestId === generation.current && cacheKey === currentKey.current;
    setIsRefreshing(true);
    try {
      return await runSessionWork(async () => {
        const cached = await readServerCache<T>(db, cacheKey);
        if (current()) {
          setData(cached?.value ?? null);
          setCachedAt(cached?.fetchedAt ?? null);
          setIsCachedFallback(Boolean(cached));
          setError(null);
        }
        if (!hasNetwork) {
          if (current() && !cached) setError('Connect to load this workspace for the first time.');
          return cached?.value ?? null;
        }
        try {
          const fresh = await loader();
          // A route/filter change must not allow an older response to replace
          // the new selection or overwrite a newer cache entry.
          if (!current()) return null;
          const fetchedAt = new Date().toISOString();
          await writeServerCache(db, cacheKey, fresh, fetchedAt);
          if (current()) {
            setData(fresh);
            setCachedAt(fetchedAt);
            setIsCachedFallback(false);
            setLoadedRevision(revision);
            setError(null);
          }
          return fresh;
        } catch (reason) {
          if (!current()) return null;
          if (reason instanceof MobileApiHttpError && [401, 403, 404].includes(reason.status)) {
            await db.runAsync('DELETE FROM server_cache WHERE cache_key = ?', cacheKey);
            setData(null);
            setCachedAt(null);
            setIsCachedFallback(false);
          } else {
            setIsCachedFallback(Boolean(cached));
          }
          setError(messageFromError(reason));
          throw reason;
        }
      });
    } finally {
      if (current()) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [cacheKey, db, hasNetwork, loader, revision]);

  useFocusEffect(useCallback(() => {
    // A completed push/pull refreshes server calculations as well as the
    // editable replica. A mounted but hidden screen makes no requests.
    void load().catch(() => undefined);
    return () => { generation.current += 1; };
  }, [load]));

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await syncNow();
    } catch {
      // A failed sync is visible in the account status; the last server
      // snapshot remains useful, and its freshness label names pending edits.
    }
    return load();
  }, [load, syncNow]);

  return { data, isLoading, isRefreshing, error, refresh, setData, cachedAt, isCachedFallback,
    isStale: loadedRevision !== revision };
}
