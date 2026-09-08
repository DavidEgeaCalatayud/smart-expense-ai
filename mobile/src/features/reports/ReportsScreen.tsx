import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { useCachedServerResource } from '../../api/useCachedServerResource';
import { useOnlineAction } from '../../api/useOnlineAction';
import { DataFreshness } from '../../components/DataFreshness';
import { currentMonth, MonthSelector } from '../../components/MonthSelector';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import { useOnlineSync } from '../../sync/OnlineSyncProvider';
import { shareMonthlyReport } from './reportExport';

export function ReportsScreen() {
  const api = useMemo(() => createServerDerivedApi(), []);
  const { hasNetwork } = useOnlineSync();
  const online = useOnlineAction();
  const [month, setMonth] = useState(currentMonth);
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const loader = useCallback(() => api.getReportsWorkspace(month), [api, month]);
  const resource = useCachedServerResource(`server:reports:v1:${month}`, loader);
  const report = resource.data?.report;

  const share = async () => {
    setIsSharing(true);
    setShareError(null);
    try {
      await online.run(() => shareMonthlyReport(api, month));
    } catch (reason) {
      setShareError(reason instanceof Error ? reason.message : 'Could not export the report.');
    } finally { setIsSharing(false); }
  };

  return <ServerWorkspaceShell active="reports" title="Reports"
    subtitle="Review your monthly income, spending and category totals. Export a CSV to save or share."
    isRefreshing={resource.isRefreshing || isSharing}
    onRefresh={() => { void resource.refresh().catch(() => undefined); }}>
    <MonthSelector month={month} onChange={setMonth} />
    {resource.isLoading && !resource.data ? <ActivityIndicator /> : null}
    {resource.error ? <Text style={s.error}>{resource.error}</Text> : null}
    <DataFreshness cachedAt={resource.cachedAt} isCachedFallback={resource.isCachedFallback} />
    {resource.data && !resource.data.entitlements.features.exportableReports?.enabled ? (
      <View style={s.card}><Text style={s.cardTitle}>Reports require Premium access</Text>
        <Text style={s.body}>Report export is not enabled for your account.</Text>
        <Text style={s.metadata}>Current plan: {resource.data.entitlements.planTier}</Text></View>
    ) : null}
    {report && report.month === month ? <>
      <View style={s.row}>
        <View style={s.rowCard}><Text style={s.metadata}>Income</Text><Text style={s.cardValue}>{report.totalIncome} €</Text></View>
        <View style={s.rowCard}><Text style={s.metadata}>Expenses</Text><Text style={s.cardValue}>{report.totalExpenses} €</Text></View>
      </View>
      <View style={s.card}><Text style={s.cardTitle}>Net: {report.net} €</Text>
        <Text style={s.body}>{report.transactionCount} transactions in {month}</Text></View>
      <Pressable accessibilityRole="button" disabled={!hasNetwork || isSharing || resource.isCachedFallback}
        onPress={() => { void share(); }} style={[s.primaryButton,
          (!hasNetwork || isSharing || resource.isCachedFallback) && { opacity: 0.5 }]}>
        <Text style={s.primaryButtonText}>{isSharing ? 'Preparing CSV…' : 'Export CSV'}</Text>
      </Pressable>
      {!hasNetwork ? <Text style={s.metadata}>Reconnect to export a current report.</Text> : null}
      <Text style={s.sectionTitle}>Categories</Text>
      {report.categoryBreakdown.map((category) => <View key={`${category.type}:${category.category}`} style={s.card}>
        <Text style={s.cardTitle}>{category.category}</Text>
        <Text style={s.body}>{category.total} € · {category.type} · {category.transactionCount} transactions</Text>
      </View>)}
      {report.categoryBreakdown.length === 0 ? <Text style={s.empty}>No transactions for this month.</Text> : null}
    </> : null}
    {shareError ? <Text style={s.error}>{shareError}</Text> : null}
  </ServerWorkspaceShell>;
}
