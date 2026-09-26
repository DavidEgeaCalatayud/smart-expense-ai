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

export interface NetWorthLocalSummary {
  total: number;
  available: number;
  reserved: number;
  invested: number;
  daily: number;
  savings: number;
  emergencyFund: number;
  opportunities: number;
  investment: number;
  other: number;
}

export interface NetWorthHistoryPoint {
  recordedAt: string;
  totalMinor: number;
  pending: boolean;
}

export interface FinancialAccountFormInput {
  name: string;
  institution: string | null;
  accountType: FinancialAccountType;
  purpose: FinancialAccountPurpose;
  currentBalance: string;
  includeInNetWorth: boolean;
}

function summarize(accounts: readonly LocalFinancialAccountRow[]): NetWorthLocalSummary {
  const byPurpose: Record<FinancialAccountPurpose, number> = {
    daily: 0,
    savings: 0,
    emergency_fund: 0,
    opportunities: 0,
    investment: 0,
    other: 0,
  };
  for (const account of accounts) {
    if (account.archived === 1 || account.include_in_net_worth === 0) continue;
    byPurpose[account.purpose] += account.current_balance_minor;
  }
  const available = byPurpose.daily + byPurpose.other;
  const reserved = byPurpose.savings + byPurpose.emergency_fund + byPurpose.opportunities;
  const invested = byPurpose.investment;
  return {
    total: available + reserved + invested,
    available,
    reserved,
    invested,
    daily: byPurpose.daily,
    savings: byPurpose.savings,
    emergencyFund: byPurpose.emergency_fund,
    opportunities: byPurpose.opportunities,
    investment: byPurpose.investment,
    other: byPurpose.other,
  };
}

function historyFromSnapshots(
  accounts: readonly LocalFinancialAccountRow[],
  snapshots: readonly LocalFinancialAccountSnapshotRow[],
): NetWorthHistoryPoint[] {
  const included = new Set(
    accounts
      .filter((account) => account.archived === 0 && account.include_in_net_worth === 1)
      .map((account) => account.id),
  );
  const balances = new Map<string, number>();
  const cutoff = Date.now() - 366 * 24 * 60 * 60 * 1000;
  const points: NetWorthHistoryPoint[] = [];
  const ordered = [...snapshots]
    .filter((snapshot) => included.has(snapshot.financial_account_id))
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id));

  for (const snapshot of ordered) {
    balances.set(snapshot.financial_account_id, snapshot.balance_minor);
    const totalMinor = [...balances.values()].reduce((sum, value) => sum + value, 0);
    if (Date.parse(snapshot.recorded_at) >= cutoff) {
      points.push({
        recordedAt: snapshot.recorded_at,
        totalMinor,
        pending: snapshot.pending === 1,
      });
    }
  }
  return points;
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
        `SELECT s.*
         FROM financial_account_snapshots s
         JOIN financial_accounts a ON a.id = s.financial_account_id
         WHERE a.archived = 0
         ORDER BY s.recorded_at ASC, s.id ASC`,
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
        `SELECT s.* FROM financial_account_snapshots s
         JOIN financial_accounts a ON a.id = s.financial_account_id
         WHERE a.archived = 0 ORDER BY s.recorded_at ASC, s.id ASC`,
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

  const summary = useMemo(() => summarize(accounts), [accounts]);
  const history = useMemo(() => historyFromSnapshots(accounts, snapshots), [accounts, snapshots]);

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
