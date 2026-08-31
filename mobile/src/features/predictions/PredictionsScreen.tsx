import type {
  SpendingForecastResponse,
  UpcomingPaymentsResponse,
} from '@smart-expense-ai/api-contracts';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { useServerResource } from '../../api/useServerResource';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';

interface PredictionsData {
  upcoming: UpcomingPaymentsResponse;
  forecast: SpendingForecastResponse;
}

export function PredictionsScreen() {
  const api = useMemo(createServerDerivedApi, []);
  const loader = useCallback(async (): Promise<PredictionsData> => {
    const [upcoming, forecast] = await Promise.all([
      api.getUpcomingPayments(30),
      api.getSpendingForecast(),
    ]);
    return { upcoming, forecast };
  }, [api]);
  const { data, isLoading, isRefreshing, error, refresh } = useServerResource(loader);

  return (
    <ServerWorkspaceShell
      active="predictions"
      title="Predictions"
      subtitle="recurring-calendar-v1 and spending-forecast-v1 stay server-owned. Android shows deterministic projections, assumptions and backtest evidence without inventing confidence or running forecasting models locally."
      isRefreshing={isRefreshing}
      onRefresh={() => void refresh().catch(() => undefined)}
    >
      {isLoading && !data ? <ActivityIndicator size="large" /> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}

      {data ? (
        <>
          <View style={s.row}>
            <View style={s.rowCard}>
              <Text style={s.metadata}>Next 30 days</Text>
              <Text style={s.cardValue}>{data.upcoming.expectedTotal} €</Text>
            </View>
            <View style={s.rowCard}>
              <Text style={s.metadata}>Upcoming</Text>
              <Text style={s.cardValue}>{data.upcoming.upcomingCount}</Text>
            </View>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Month-end forecast</Text>
            <View style={s.card}>
              <Text style={s.cardTitle}>{data.forecast.month}</Text>
              <Text style={s.body}>Spent so far: {data.forecast.spentSoFar} €</Text>
              <Text style={s.metadata}>
                Day {data.forecast.elapsedDays}/{data.forecast.daysInMonth} · {data.forecast.remainingDays} remaining
              </Text>
            </View>
            {data.forecast.baselines.map((baseline) => (
              <View key={baseline.baseline} style={s.card}>
                <Text style={s.cardTitle}>{baseline.label}</Text>
                <Text style={s.cardValue}>
                  {baseline.available && baseline.projectedMonthEnd
                    ? `${baseline.projectedMonthEnd} €`
                    : 'Unavailable'}
                </Text>
                <Text style={s.metadata}>
                  Backtest support {baseline.backtest.support} · MAE {baseline.backtest.mae ?? 'n/a'}
                  {baseline.backtest.mae ? ' €' : ''} · sMAPE {baseline.backtest.smapePercent ?? 'n/a'}
                  {baseline.backtest.smapePercent ? '%' : ''}
                </Text>
                {baseline.assumptions.map((assumption) => (
                  <Text key={assumption} style={s.metadata}>• {assumption}</Text>
                ))}
              </View>
            ))}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Upcoming recurring payments</Text>
            {data.upcoming.upcomingPayments.length === 0 ? (
              <Text style={s.empty}>No qualified future recurring payments in the next 30 days.</Text>
            ) : (
              data.upcoming.upcomingPayments.map((payment) => (
                <View key={payment.streamKey} style={s.card}>
                  <Text style={s.cardTitle}>{payment.merchant}</Text>
                  <Text style={s.cardValue}>{payment.expectedAmount} €</Text>
                  <Text style={s.body}>{payment.expectedDate} · {payment.status}</Text>
                  <Text style={s.metadata}>{payment.explanation}</Text>
                </View>
              ))
            )}
          </View>

          {data.upcoming.overduePayments.length > 0 ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Overdue schedules</Text>
              {data.upcoming.overduePayments.map((payment) => (
                <View key={payment.streamKey} style={s.card}>
                  <Text style={s.cardTitle}>{payment.merchant}</Text>
                  <Text style={s.body}>{payment.expectedAmount} € · expected {payment.expectedDate}</Text>
                  <Text style={s.metadata}>{payment.explanation}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={s.metadata}>
            {data.upcoming.projectionVersion} · {data.forecast.forecastVersion} · as of {data.forecast.asOf}
          </Text>
        </>
      ) : null}
    </ServerWorkspaceShell>
  );
}
