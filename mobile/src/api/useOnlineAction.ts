import { useCallback } from 'react';
import { runSessionWork } from '../auth/sessionWork';
import { useOnlineSync } from '../sync/OnlineSyncProvider';

export function useOnlineAction() {
  const { hasNetwork, syncNow } = useOnlineSync();
  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (!hasNetwork) throw new Error('Connect to use this action. Your saved data is still available.');
    await syncNow();
    return runSessionWork(operation);
  }, [hasNetwork, syncNow]);
  return { run, hasNetwork, syncNow };
}
