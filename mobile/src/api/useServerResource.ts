import { useCallback, useEffect, useState } from 'react';

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load server data';
}

export function useServerResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loader()
      .then((next) => {
        if (!active) return;
        setData(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(messageFromError(reason));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loader]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const next = await loader();
      setData(next);
      setError(null);
      return next;
    } catch (reason) {
      setError(messageFromError(reason));
      throw reason;
    } finally {
      setIsRefreshing(false);
    }
  }, [loader]);

  return { data, isLoading, isRefreshing, error, refresh, setData };
}
