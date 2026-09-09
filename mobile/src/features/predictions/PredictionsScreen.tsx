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
  return <ServerWorkspaceShell active="predictions" title="Predictions" subtitle="See what is coming and plan your month with confidence."
    isRefreshing={resource.isRefreshing} onRefresh={() => void resource.refresh().catch(() => undefined)}>
    {resource.isLoading && !data ? <ActivityIndicator size="large" /> : null}
    {resource.error ? <Text style={resource.isCachedFallback ? s.metadata : s.error}>{resource.error}</Text> : null}
    <DataFreshness cachedAt={resource.cachedAt} isCachedFallback={resource.isCachedFallback} />
    {data ? <>
      <ForecastVisual forecast={data.forecast} />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} style={s.secondaryButton}><Text>{details ? 'Hide forecast details' : 'How this estimate works'}</Text></Pressable>
      {details ? data.forecast.baselines.map((baseline) => <View key={baseline.baseline} style={s.card}>
        <Text style={s.cardTitle}>{baseline.label}</Text><Text style={s.cardValue}>{baseline.available && baseline.projectedMonthEnd ? money(baseline.projectedMonthEnd) : 'Not enough history'}</Text>
        <Text style={s.metadata}>Checked against {baseline.backtest.support} historical periods{baseline.backtest.mae ? `. Average error: ${money(baseline.backtest.mae)}` : ''}.</Text>
        {baseline.assumptions.map((assumption) => <Text style={s.body} key={assumption}>• {assumption}</Text>)}
      </View>) : null}
      <View style={s.row}><View style={s.rowCard}><Text style={s.metadata}>Expected in 30 days</Text><Text style={s.cardValue}>{money(data.upcoming.expectedTotal)}</Text></View>
        <View style={s.rowCard}><Text style={s.metadata}>Upcoming payments</Text><Text style={s.cardValue}>{data.upcoming.upcomingCount}</Text></View></View>
      <Text style={s.sectionTitle}>Subscriptions & recurring payments</Text>
      {data.upcoming.upcomingPayments.map((payment) => <SubscriptionRow key={`${payment.streamKey}:${payment.expectedDate}`} payment={payment} />)}
      {!data.upcoming.upcomingPayments.length ? <Text style={s.empty}>No recurring payments detected for the next 30 days.</Text> : null}
      {data.upcoming.overduePayments.length ? <View style={s.section}><Text style={s.sectionTitle}>Check these payments</Text>
        {data.upcoming.overduePayments.map((payment) => <SubscriptionRow key={`${payment.streamKey}:${payment.expectedDate}`} payment={payment} />)}
      </View> : null}
      <Text style={s.metadata}>Based on your recorded history as of {data.forecast.asOf}. A prediction does not schedule or make a payment.</Text>
    </> : null}
  </ServerWorkspaceShell>;
}
