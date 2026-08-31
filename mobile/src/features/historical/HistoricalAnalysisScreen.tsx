import type { HistoricalAnalysisResponseV22 } from '@smart-expense-ai/api-contracts';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MobileApiHttpError } from '../../api/client';
import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { useCachedServerResource } from '../../api/useCachedServerResource';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';

interface HistoricalData {
  analysis: HistoricalAnalysisResponseV22 | null;
}

export function HistoricalAnalysisScreen() {
  const api = useMemo(createServerDerivedApi, []);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const loader = useCallback(async (): Promise<HistoricalData> => {
    try {
      return { analysis: await api.getLatestHistoricalAnalysis() };
    } catch (error) {
      if (error instanceof MobileApiHttpError && error.status === 404) {
        return { analysis: null };
      }
      throw error;
    }
  }, [api]);
  const {
    data,
    isLoading,
    isRefreshing,
    error,
    refresh,
    cachedAt,
    isCachedFallback,
  } = useCachedServerResource('server:historical:v1', loader);

  const runAnalysis = async () => {
    setIsRunning(true);
    setRunError(null);
    try {
      await api.runHistoricalAnalysis(12);
      await refresh();
    } catch (reason) {
      setRunError(reason instanceof Error ? reason.message : 'Unable to run historical analysis');
    } finally {
      setIsRunning(false);
    }
  };

  const analysis = data?.analysis ?? null;

  return (
    <ServerWorkspaceShell
      active="historical"
      title="Historical Analysis"
      subtitle="historical-v2.2 is executed and persisted on FastAPI. Android displays the latest evidence and can request a fresh 12-month analysis without reimplementing recurrence, outlier or trend algorithms."
      isRefreshing={isRefreshing || isRunning}
      onRefresh={() => void refresh().catch(() => undefined)}
    >
      {isLoading && !data ? <ActivityIndicator size="large" /> : null}
      {error ? <Text style={isCachedFallback ? s.metadata : s.error}>{error}</Text> : null}
      {runError ? <Text style={s.error}>{runError}</Text> : null}
      {cachedAt ? <Text style={s.metadata}>Latest local snapshot: {cachedAt}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={isRunning || isCachedFallback}
        onPress={() => void runAnalysis()}
        style={({ pressed }) => [
          s.primaryButton,
          pressed && styles.pressed,
          (isRunning || isCachedFallback) && styles.disabled,
        ]}
      >
        <Text style={s.primaryButtonText}>{isRunning ? 'Analyzing…' : 'Run 12-month analysis'}</Text>
      </Pressable>

      {!isLoading && !analysis ? (
        <Text style={s.empty}>No historical snapshot exists yet. Run the server analysis to create one.</Text>
      ) : null}

      {analysis ? (
        <>
          <View style={s.row}>
            <View style={s.rowCard}>
              <Text style={s.metadata}>Transactions</Text>
              <Text style={s.cardValue}>{analysis.analyzedTransactions}</Text>
            </View>
            <View style={s.rowCard}>
              <Text style={s.metadata}>Complete months</Text>
              <Text style={s.cardValue}>{analysis.coverage.completeMonths}</Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Trend</Text>
            <Text style={s.cardValue}>{analysis.trend.direction}</Text>
            <Text style={s.body}>Average monthly spend: {analysis.trend.averageMonthlySpend} €</Text>
            <Text style={s.body}>Monthly slope: {analysis.trend.monthlySlope} €</Text>
            <Text style={s.metadata}>R² {analysis.trend.rSquared} · {analysis.trend.completeMonthsUsed} complete months</Text>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Recurring profiles</Text>
            {analysis.recurringProfiles.length === 0 ? (
              <Text style={s.empty}>No qualified recurring profiles in this snapshot.</Text>
            ) : (
              analysis.recurringProfiles.slice(0, 12).map((profile) => (
                <View key={profile.streamKey ?? `${profile.merchant}-${profile.nextExpectedDate}`} style={s.card}>
                  <Text style={s.cardTitle}>{profile.merchant}</Text>
                  <Text style={s.body}>{profile.medianAmount} € · {profile.cadence}</Text>
                  <Text style={s.metadata}>
                    Next {profile.nextExpectedDate} · score {profile.patternScore} · {profile.occurrenceCount} occurrences
                  </Text>
                  <Text style={s.metadata}>
                    {profile.streamBasis} · {profile.priceRegimeCount} price regimes
                    {profile.lifecycleReactivated ? ' · reactivated' : ''}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Outliers</Text>
            {analysis.outliers.length === 0 ? (
              <Text style={s.empty}>No historical amount outliers in this snapshot.</Text>
            ) : (
              analysis.outliers.slice(0, 10).map((outlier) => (
                <View key={outlier.transactionId} style={s.card}>
                  <Text style={s.cardTitle}>{outlier.merchant}</Text>
                  <Text style={s.body}>{outlier.amount} € · {outlier.date}</Text>
                  <Text style={s.metadata}>
                    Median {outlier.baselineMedian} € · deviation {outlier.deviationScore} · {outlier.baselinePolicy}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Category shifts</Text>
            {analysis.categoryShifts.length === 0 ? (
              <Text style={s.empty}>No qualified category shifts.</Text>
            ) : (
              analysis.categoryShifts.map((shift) => (
                <View key={shift.category} style={s.card}>
                  <Text style={s.cardTitle}>{shift.category}</Text>
                  <Text style={s.body}>{shift.direction} · Δ {shift.delta} €</Text>
                  <Text style={s.metadata}>
                    {shift.previousThreeMonthAverage} € → {shift.currentThreeMonthAverage} €
                  </Text>
                </View>
              ))
            )}
          </View>

          <Text style={s.metadata}>
            {analysis.analysisVersion} · generated {analysis.generatedAt} · snapshot {analysis.snapshotId}
          </Text>
        </>
      ) : null}
    </ServerWorkspaceShell>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
