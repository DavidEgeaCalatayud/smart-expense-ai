import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import type {
  FinancialAccountPurpose,
  FinancialAccountType,
} from '@smart-expense-ai/api-contracts';
import type {
  LocalFinancialAccountRow,
  LocalFinancialAccountSnapshotRow,
} from '../../database/types';
import {
  archiveOfflineFinancialAccount,
  createOfflineFinancialAccount,
  updateOfflineFinancialAccountBalance,
  updateOfflineFinancialAccountMetadata,
} from './offlineFinancialAccountMutations';
import {
  historyFromFinancialAccountSnapshots,
  summarizeFinancialAccounts,
} from './moneyCalculations';

export interface FinancialAccountFormInput {
  name: string;
  institution: string | null;
  accountType: FinancialAccountType;
  purpose: FinancialAccountPurpose;
  currentBalance: string;
  includeInNetWorth: boolean;
}

export function useFinancialAccounts() {
  const db = useSQLiteContext();
  const [accounts, setAccounts] = useState<LocalFinancialAccountRow[]>([]);
  const [snapshots, setSnapshots] = useState<LocalFinancialAccountSnapshotRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    const [nextAccounts, nextSnapshots] = await Promise.all([
      db.getAllAsync<LocalFinancialAccountRow>(
        `SELECT * FROM financial_accounts
         WHERE archived = 0
         ORDER BY created_at ASC, id ASC`,
      ),
      db.getAllAsync<LocalFinancialAccountSnapshotRow>(
        `SELECT * FROM financial_account_snapshots
         ORDER BY recorded_at ASC, id ASC`,
      ),
    ]);
    setAccounts(nextAccounts);
    setSnapshots(nextSnapshots);
  }, [db]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      db.getAllAsync<LocalFinancialAccountRow>(
        `SELECT * FROM financial_accounts WHERE archived = 0 ORDER BY created_at ASC, id ASC`,
      ),
      db.getAllAsync<LocalFinancialAccountSnapshotRow>(
        `SELECT * FROM financial_account_snapshots ORDER BY recorded_at ASC, id ASC`,
      ),
    ])
      .then(([nextAccounts, nextSnapshots]) => {
        if (!active) return;
        setAccounts(nextAccounts);
        setSnapshots(nextSnapshots);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'No se pudo cargar Mi dinero.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [db]);

  const mutate = useCallback(async (operation: () => Promise<void>) => {
    setIsSaving(true);
    setError(null);
    try {
      await operation();
      await loadRows();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo actualizar Mi dinero.');
      throw caught;
    } finally {
      setIsSaving(false);
    }
  }, [loadRows]);

  const create = useCallback(async (input: FinancialAccountFormInput) => {
    await mutate(async () => {
      await createOfflineFinancialAccount(db, input);
    });
  }, [db, mutate]);

  const updateMetadata = useCallback(async (
    accountId: string,
    input: Omit<FinancialAccountFormInput, 'currentBalance'>,
  ) => {
    await mutate(() => updateOfflineFinancialAccountMetadata(db, accountId, input));
  }, [db, mutate]);

  const updateBalance = useCallback(async (accountId: string, balance: string) => {
    await mutate(() => updateOfflineFinancialAccountBalance(db, accountId, balance));
  }, [db, mutate]);

  const archive = useCallback(async (accountId: string) => {
    await mutate(() => archiveOfflineFinancialAccount(db, accountId));
  }, [db, mutate]);

  const summary = useMemo(() => summarizeFinancialAccounts(accounts), [accounts]);
  const history = useMemo(() => historyFromFinancialAccountSnapshots(snapshots), [snapshots]);

  return {
    accounts,
    snapshots,
    summary,
    history,
    isLoading,
    isSaving,
    error,
    reload: loadRows,
    create,
    updateMetadata,
    updateBalance,
    archive,
  };
}
