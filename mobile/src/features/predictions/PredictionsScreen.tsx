import type { SpendingForecastResponse, UpcomingPaymentsResponse } from '@smart-expense-ai/api-contracts';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from '../../ui/primitives';
import { DataFreshness } from '../../components/DataFreshness';
import { ForecastVisual, SubscriptionRow, money } from '../../components/FinancialVisuals';
import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { useCachedServerResource } from '../../api/useCachedServerResource';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
interface PredictionsData { upcoming: UpcomingPaymentsResponse; forecast: SpendingForecastResponse }
export function PredictionsScreen() {
  const api = useMemo(() => createServerDerivedApi(), []);
  const [details, setDetails] = useState(false);
  const loader = useCallback(async (): Promise<PredictionsData> => {
    const [upcoming, forecast] = await Promise.all([api.getUpcomingPayments(30), api.getSpendingForecast()]);
    return { upcoming, forecast };
  }, [api]);
  const resource = useCachedServerResource('server:predictions:v1', loader);
  const data = resource.data;
  return <ServerWorkspaceShell active="predictions" title="Predicciones" subtitle="Anticípate a lo que viene y planifica el mes con más claridad."
    isRefreshing={resource.isRefreshing} onRefresh={() => void resource.refresh().catch(() => undefined)}>
    {resource.isLoading && !data ? <ActivityIndicator size="large" /> : null}
    {resource.error ? <Text style={resource.isCachedFallback ? s.metadata : s.error}>{resource.error}</Text> : null}
    <DataFreshness cachedAt={resource.cachedAt} isCachedFallback={resource.isCachedFallback} />
    {data ? <>
      <ForecastVisual forecast={data.forecast} />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={s.secondaryButton}><Text>{details ? 'Ocultar detalles de la previsión' : 'Cómo se calcula esta estimación'}</Text></Pressable>
      {details ? data.forecast.baselines.map((baseline) => <View key={baseline.baseline} style={s.card}>
        <Text style={s.cardTitle}>{baseline.label}</Text><Text style={s.cardValue}>{baseline.available && baseline.projectedMonthEnd ? money(baseline.projectedMonthEnd) : 'No hay suficiente historial'}</Text>
        <Text style={s.metadata}>Comprobado con {baseline.backtest.support} periodos históricos{baseline.backtest.mae ? `. Error medio: ${money(baseline.backtest.mae)}` : ''}.</Text>
        {baseline.assumptions.map((assumption) => <Text style={s.body} key={assumption}>• {assumption}</Text>)}
      </View>) : null}
      <View style={s.row}><View style={s.rowCard}><Text style={s.metadata}>Previsto en 30 días</Text><Text style={s.cardValue}>{money(data.upcoming.expectedTotal)}</Text></View>
        <View style={s.rowCard}><Text style={s.metadata}>Próximos pagos</Text><Text style={s.cardValue}>{data.upcoming.upcomingCount}</Text></View></View>
      <Text style={s.sectionTitle}>Suscripciones y pagos recurrentes</Text>
      {data.upcoming.upcomingPayments.map((payment) => <SubscriptionRow key={`${payment.streamKey}:${payment.expectedDate}`} payment={payment} />)}
      {!data.upcoming.upcomingPayments.length ? <Text style={s.empty}>No se han detectado pagos recurrentes para los próximos 30 días.</Text> : null}
      {data.upcoming.overduePayments.length ? <View style={s.section}><Text style={s.sectionTitle}>Revisa estos pagos</Text>
        {data.upcoming.overduePayments.map((payment) => <SubscriptionRow key={`${payment.streamKey}:${payment.expectedDate}`} payment={payment} />)}
      </View> : null}
      <Text style={s.metadata}>Basado en tu historial registrado hasta {data.forecast.asOf}. Una predicción no programa ni realiza pagos.</Text>
    </> : null}
  </ServerWorkspaceShell>;
}
