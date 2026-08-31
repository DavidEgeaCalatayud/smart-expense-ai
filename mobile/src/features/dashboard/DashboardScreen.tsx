import type { MonthlyExpensePointV2, TransactionSummaryV2 } from '@smart-expense-ai/api-contracts';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { useCachedServerResource } from '../../api/useCachedServerResource';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';

interface DashboardData {
  summary: TransactionSummaryV2;
  monthly: MonthlyExpensePointV2[];
}

function money(value: string): string {
  return `${value} €`;
}

export function DashboardScreen() {
  const api = useMemo(createServerDerivedApi, []);
  const loader = useCallback(async (): Promise<DashboardData> => {
    const [summary, monthly] = await Promise.all([api.getSummary(), api.getMonthlyExpenses(6)]);
    return { summary, monthly };
  }, [api]);
  const { data, isLoading, isRefreshing, error, refresh, cachedAt, isCachedFallback } =
    useCachedServerResource('server:dashboard:v1', loader);

  return (
    <ServerWorkspaceShell
      active="dashboard"
      title="Dashboard"
      subtitle="Read-only analytics calculated by FastAPI from the authoritative PostgreSQL account state. Android renders the contract but does not recompute financial totals."
      isRefreshing={isRefreshing}
      onRefresh={() => void refresh().catch(() => undefined)}
    >
      {isLoading && !data ? <ActivityIndicator size="large" /> : null}
      {error ? <Text style={isCachedFallback ? s.metadata : s.error}>{error}</Text> : null}
      {cachedAt ? <Text style={s.metadata}>Latest local snapshot: {cachedAt}</Text> : null}

      {data ? (
        <>
          <View style={s.row}>
            <View style={s.rowCard}>
              <Text style={s.metadata}>Balance</Text>
              <Text style={s.cardValue}>{money(data.summary.balance)}</Text>
            </View>
            <View style={s.rowCard}>
              <Text style={s.metadata}>Transactions</Text>
              <Text style={s.cardValue}>{data.summary.transactionCount}</Text>
            </View>
          </View>

          <View style={s.row}>
            <View style={s.rowCard}>
              <Text style={s.metadata}>Income</Text>
              <Text style={s.cardValue}>{money(data.summary.totalIncome)}</Text>
            </View>
            <View style={s.rowCard}>
              <Text style={s.metadata}>Expenses</Text>
              <Text style={s.cardValue}>{money(data.summary.totalExpenses)}</Text>
            </View>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Last six months</Text>
            {data.monthly.length === 0 ? (
              <Text style={s.empty}>No monthly expense history is available yet.</Text>
            ) : (
              data.monthly.map((point) => (
                <View key={point.month} style={s.card}>
                  <Text style={s.cardTitle}>{point.month}</Text>
                  <Text style={s.cardValue}>{money(point.amount)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Review signals</Text>
            <Text style={s.body}>{data.summary.reviewCount} transactions need review.</Text>
            <Text style={s.body}>{data.summary.recurringCount} transactions are marked recurring.</Text>
          </View>
        </>
      ) : null}
    </ServerWorkspaceShell>
  );
}
