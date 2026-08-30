import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import type { LocalTransactionRow } from '../../database/types';
import { SqliteTransactionRepository } from '../../repositories/transactionRepository';
import { createOfflineTransaction } from './createOfflineTransaction';
import {
  deleteOfflineTransaction,
  type OfflineTransactionEditInput,
  updateOfflineTransaction,
} from './offlineTransactionMutations';
import type { OfflineTransactionFormInput } from './validation';

export function useTransactions() {
  const db = useSQLiteContext();
  const [transactions, setTransactions] = useState<LocalTransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const repository = new SqliteTransactionRepository(db);
      setTransactions(await repository.listRecent());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load local transactions');
    } finally {
      setIsLoading(false);
    }
  }, [db]);

  useEffect(() => {
    let active = true;

    const loadInitialTransactions = async () => {
      try {
        const repository = new SqliteTransactionRepository(db);
        const rows = await repository.listRecent();
        if (active) {
          setTransactions(rows);
        }
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : 'Could not load local transactions',
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadInitialTransactions();

    return () => {
      active = false;
    };
  }, [db]);

  const create = useCallback(
    async (input: OfflineTransactionFormInput) => {
      setIsSaving(true);
      setError(null);
      try {
        await createOfflineTransaction(db, input);
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
        await updateOfflineTransaction(db, transactionId, input);
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
        await deleteOfflineTransaction(db, transactionId);
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
