import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import {
  resolveConflictWithServer,
  retryConflictWithLocalValue,
} from './conflictResolution';
import {
  listUnresolvedConflicts,
  type StoredConflictRow,
} from './conflictRepository';

export function useConflicts(onResolved?: () => Promise<void> | void) {
  const db = useSQLiteContext();
  const [conflicts, setConflicts] = useState<StoredConflictRow[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setConflicts(await listUnresolvedConflicts(db));
  }, [db]);

  useEffect(() => {
    let active = true;
    void listUnresolvedConflicts(db).then((rows) => {
      if (active) {
        setConflicts(rows);
      }
    });
    return () => {
      active = false;
    };
  }, [db]);

  const resolveWithServer = useCallback(
    async (conflictId: number) => {
      setIsResolving(true);
      setError(null);
      try {
        await resolveConflictWithServer(db, conflictId);
        await reload();
        await onResolved?.();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not resolve conflict');
        throw caught;
      } finally {
        setIsResolving(false);
      }
    },
    [db, onResolved, reload],
  );

  const retryMine = useCallback(
    async (conflictId: number) => {
      setIsResolving(true);
      setError(null);
      try {
        await retryConflictWithLocalValue(db, conflictId);
        await reload();
        await onResolved?.();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not retry local value');
        throw caught;
      } finally {
        setIsResolving(false);
      }
    },
    [db, onResolved, reload],
  );

  return {
    conflicts,
    isResolving,
    error,
    reload,
    resolveWithServer,
    retryMine,
  };
}
