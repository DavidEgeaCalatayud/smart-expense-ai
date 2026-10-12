import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from '../../ui/primitives';

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
      setShareError(reason instanceof Error ? reason.message : 'No se ha podido exportar el informe.');
    } finally { setIsSharing(false); }
  };

  return <ServerWorkspaceShell active="reports" title="Informes"
    subtitle="Revisa ingresos, gastos y categorías del mes y exporta un CSV cuando lo necesites."
    isRefreshing={resource.isRefreshing || isSharing}
    onRefresh={() => { void resource.refresh().catch(() => undefined); }}>
    <MonthSelector month={month} onChange={setMonth} />
    {resource.isLoading && !resource.data ? <ActivityIndicator /> : null}
    {resource.error ? <Text style={s.error}>{resource.error}</Text> : null}
    <DataFreshness cachedAt={resource.cachedAt} isCachedFallback={resource.isCachedFallback} />
    {resource.data && !resource.data.entitlements.features.exportableReports?.enabled ? (
      <View style={s.card}><Text style={s.cardTitle}>Los informes requieren acceso Premium</Text>
        <Text style={s.body}>La exportación de informes no está disponible en tu cuenta.</Text>
        <Text style={s.metadata}>Plan actual: {resource.data.entitlements.planTier}</Text></View>
    ) : null}
    {report && report.month === month ? <>
      <View style={s.row}>
        <View style={s.rowCard}><Text style={s.metadata}>Ingresos</Text><Text style={s.cardValue}>{report.totalIncome} €</Text></View>
        <View style={s.rowCard}><Text style={s.metadata}>Gastos</Text><Text style={s.cardValue}>{report.totalExpenses} €</Text></View>
      </View>
      <View style={s.card}><Text style={s.cardTitle}>Neto: {report.net} €</Text>
        <Text style={s.body}>{report.transactionCount} movimientos en {month}</Text></View>
      <Pressable accessibilityRole="button" disabled={!hasNetwork || isSharing || resource.isCachedFallback}
        onPress={() => { void share(); }} style={[s.primaryButton,
          (!hasNetwork || isSharing || resource.isCachedFallback) && { opacity: 0.5 }]}>
        <Text style={s.primaryButtonText}>{isSharing ? 'Preparando CSV…' : 'Exportar CSV'}</Text>
      </Pressable>
      {!hasNetwork ? <Text style={s.metadata}>Vuelve a conectarte para exportar un informe actualizado.</Text> : null}
      <Text style={s.sectionTitle}>Categorías</Text>
      {report.categoryBreakdown.map((category) => <View key={`${category.type}:${category.category}`} style={s.card}>
        <Text style={s.cardTitle}>{category.category}</Text>
        <Text style={s.body}>{category.total} € · {category.type} · {category.transactionCount} movimientos</Text>
      </View>)}
      {report.categoryBreakdown.length === 0 ? <Text style={s.empty}>No hay movimientos este mes.</Text> : null}
    </> : null}
    {shareError ? <Text style={s.error}>{shareError}</Text> : null}
  </ServerWorkspaceShell>;
}
