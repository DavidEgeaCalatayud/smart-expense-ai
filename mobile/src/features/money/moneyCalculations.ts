import type { FinancialAccountPurpose } from '@smart-expense-ai/api-contracts';

import type {
  LocalFinancialAccountRow,
  LocalFinancialAccountSnapshotRow,
} from '../../database/types';

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

export function summarizeFinancialAccounts(
  accounts: readonly LocalFinancialAccountRow[],
): NetWorthLocalSummary {
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

export function historyFromFinancialAccountSnapshots(
  snapshots: readonly LocalFinancialAccountSnapshotRow[],
  nowMs = Date.now(),
): NetWorthHistoryPoint[] {
  const state = new Map<string, LocalFinancialAccountSnapshotRow>();
  const cutoffMs = nowMs - 366 * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const daily = new Map<string, NetWorthHistoryPoint>();
  let baselineTotal = 0;
  let baselinePending = false;
  let hasBaseline = false;

  const ordered = [...snapshots]
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id.localeCompare(b.id));

  const totalFromState = () => [...state.values()].reduce(
    (sum, snapshot) => (
      snapshot.include_in_net_worth === 1 && snapshot.archived === 0
        ? sum + snapshot.balance_minor
        : sum
    ),
    0,
  );
  const pendingFromState = () => [...state.values()].some((snapshot) => snapshot.pending === 1);

  for (const snapshot of ordered) {
    state.set(snapshot.financial_account_id, snapshot);
    const totalMinor = totalFromState();
    const pending = pendingFromState();
    const timestamp = Date.parse(snapshot.recorded_at);
    if (timestamp < cutoffMs) {
      baselineTotal = totalMinor;
      baselinePending = pending;
      hasBaseline = true;
      continue;
    }
    const day = snapshot.recorded_at.slice(0, 10);
    daily.set(day, {
      recordedAt: snapshot.recorded_at,
      totalMinor,
      pending,
    });
  }

  const points: NetWorthHistoryPoint[] = [];
  if (hasBaseline) {
    points.push({
      recordedAt: cutoffIso,
      totalMinor: baselineTotal,
      pending: baselinePending,
    });
  }
  points.push(...[...daily.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, point]) => point));
  return points;
}
