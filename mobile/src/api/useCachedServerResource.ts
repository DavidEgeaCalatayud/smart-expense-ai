import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { readServerCache, writeServerCache } from '../database/serverCacheRepository';

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load server data';
}

export function useCachedServerResource<T>(cacheKey: string, loader: () => Promise<T>) {
  const db = useSQLiteContext();
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [isCachedFallback, setIsCachedFallback] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const cached = await readServerCache<T>(db, cacheKey);
      if (active && cached) {
        setData(cached.value);
        setCachedAt(cached.fetchedAt);
      }

      try {
        const fresh = await loader();
        const fetchedAt = new Date().toISOString();
        await writeServerCache(db, cacheKey, fresh, fetchedAt);
        if (!active) return;
        setData(fresh);
        setCachedAt(fetchedAt);
        setIsCachedFallback(false);
        setError(null);
      } catch (reason) {
        if (!active) return;
        if (cached) {
          setIsCachedFallback(true);
          setError(`Offline/server unavailable. Showing cached data from ${cached.fetchedAt}.`);
        } else {
          setError(messageFromError(reason));
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [cacheKey, db, loader]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const fresh = await loader();
      const fetchedAt = new Date().toISOString();
      await writeServerCache(db, cacheKey, fresh, fetchedAt);
      setData(fresh);
      setCachedAt(fetchedAt);
      setIsCachedFallback(false);
      setError(null);
      return fresh;
    } catch (reason) {
      setError(messageFromError(reason));
      throw reason;
    } finally {
      setIsRefreshing(false);
    }
  }, [cacheKey, db, loader]);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    refresh,
    setData,
    cachedAt,
    isCachedFallback,
  };
}
