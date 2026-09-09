import { useCallback, useEffect, useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import type { LocalTransactionRow } from '../../database/types';
import { runSessionWork } from '../../auth/sessionWork';
import type { TransactionFilters } from '../../repositories/transactionRepository';
import { SqliteTransactionRepository } from '../../repositories/transactionRepository';
import { createOfflineTransaction } from './createOfflineTransaction';
import {
  deleteOfflineTransaction,
  type OfflineTransactionEditInput,
  updateOfflineTransaction,
} from './offlineTransactionMutations';
import type { OfflineTransactionFormInput } from './validation';

export function useTransactions(filters: TransactionFilters = {}, limit = 100, offset = 0) {
  const db = useSQLiteContext();
  const [transactions, setTransactions] = useState<LocalTransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generation = useRef(0);
  const filterKey = JSON.stringify(filters);

  const reload = useCallback(() => {
    const request = ++generation.current;
    return Promise.resolve().then(() => new SqliteTransactionRepository(db)
      .list(JSON.parse(filterKey) as TransactionFilters, limit, offset))
      .then((rows) => { if (generation.current === request) { setTransactions(rows); setError(null); } })
      .catch((caught: unknown) => { if (generation.current === request) { setTransactions([]); setError(caught instanceof Error ? caught.message : 'Could not load transactions'); } })
      .finally(() => { if (generation.current === request) setIsLoading(false); });
  }, [db, filterKey, limit, offset]);

  useEffect(() => {
    void reload();
    return () => { generation.current += 1; };
  }, [reload]);

  const create = useCallback(
    async (input: OfflineTransactionFormInput) => {
      setIsSaving(true);
      setError(null);
      try {
        await runSessionWork(() => createOfflineTransaction(db, input));
        await reload();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Could not save transaction';
        setError(message);
        throw caught;
      } finally {
        setIsSaving(false);
      }
    },
    [db, reload],
  );

  const update = useCallback(
    async (transactionId: string, input: OfflineTransactionEditInput) => {
      setIsSaving(true);
      setError(null);
      try {
        await runSessionWork(() => updateOfflineTransaction(db, transactionId, input));
        await reload();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Could not update transaction';
        setError(message);
        throw caught;
      } finally {
        setIsSaving(false);
      }
    },
    [db, reload],
  );

  const remove = useCallback(
    async (transactionId: string) => {
      setIsSaving(true);
      setError(null);
      try {
        await runSessionWork(() => deleteOfflineTransaction(db, transactionId));
        await reload();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Could not delete transaction';
        setError(message);
        throw caught;
      } finally {
        setIsSaving(false);
      }
    },
    [db, reload],
  );

  return {
    transactions,
    isLoading,
    isSaving,
    error,
    reload,
    create,
    update,
    remove,
  };
}
