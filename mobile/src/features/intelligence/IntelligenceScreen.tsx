import type {
  FindingStatus,
  IntelligenceFindingResponse,
  IntelligenceSummaryResponse,
} from '@smart-expense-ai/api-contracts';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { DataFreshness } from '../../components/DataFreshness';
import { useOnlineAction } from '../../api/useOnlineAction';
import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { useCachedServerResource } from '../../api/useCachedServerResource';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';

interface IntelligenceData {
  summary: IntelligenceSummaryResponse;
  findings: IntelligenceFindingResponse[];
}

export function IntelligenceScreen() {
  const api = useMemo(() => createServerDerivedApi(), []);
  const online = useOnlineAction();
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const loader = useCallback(async (): Promise<IntelligenceData> => {
    const [summary, findings] = await Promise.all([
      api.getIntelligenceSummary(),
      api.getIntelligenceFindings(),
    ]);
    return { summary, findings };
  }, [api]);
  const {
    data,
    isLoading,
    isRefreshing,
    error,
    refresh,
    cachedAt,
    isCachedFallback,
  } = useCachedServerResource('server:intelligence:v1', loader);

  const runScan = async () => {
    setIsActing(true);
    setActionError(null);
    try {
      await online.run(() => api.runIntelligenceScan());
      await refresh();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Unable to run intelligence scan');
    } finally {
      setIsActing(false);
    }
  };

  const updateStatus = async (findingId: string, status: FindingStatus) => {
    setIsActing(true);
    setActionError(null);
    try {
      await online.run(() => api.updateFindingStatus(findingId, status));
      await refresh();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Unable to update finding');
    } finally {
      setIsActing(false);
    }
  };

  return (
    <ServerWorkspaceShell
      active="intelligence"
      title="Financial Intelligence"
      subtitle="Review unusual spending, recurring payments and subscriptions. Run a scan to check your latest activity."
      isRefreshing={isRefreshing || isActing}
      onRefresh={() => void refresh().catch(() => undefined)}
    >
      {isLoading && !data ? <ActivityIndicator size="large" /> : null}
      {error ? <Text style={isCachedFallback ? s.metadata : s.error}>{error}</Text> : null}
      {actionError ? <Text style={s.error}>{actionError}</Text> : null}
      <DataFreshness cachedAt={cachedAt} isCachedFallback={isCachedFallback} />

      {data ? (
        <>
          <View style={s.row}>
            <View style={s.rowCard}>
              <Text style={s.metadata}>Open findings</Text>
              <Text style={s.cardValue}>{data.summary.openCount}</Text>
            </View>
            <View style={s.rowCard}>
              <Text style={s.metadata}>Analyzed transactions</Text>
              <Text style={s.cardValue}>{data.summary.analyzedTransactions}</Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Activity summary</Text>
            <Text style={s.body}>{data.summary.recurringCount} recurring patterns</Text>
            <Text style={s.body}>{data.summary.missingRecurringCount} missing recurring payments</Text>
            <Text style={s.body}>{data.summary.duplicateSubscriptionCount} duplicate subscriptions</Text>
            <Text style={s.body}>{data.summary.anomalyCount} anomaly findings</Text>
            <Text style={s.metadata}>Rule contract: {data.summary.ruleVersion}</Text>
            <Text style={s.metadata}>Last scan: {data.summary.lastScanAt ?? 'Never'}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={isActing || !online.hasNetwork || isCachedFallback}
            onPress={() => void runScan()}
            style={({ pressed }) => [
              s.primaryButton,
              pressed && styles.pressed,
              (isActing || !online.hasNetwork || isCachedFallback) && styles.disabled,
            ]}
          >
            <Text style={s.primaryButtonText}>{isActing ? 'Running…' : 'Run scan'}</Text>
          </Pressable>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Findings</Text>
            {data.findings.length === 0 ? (
              <Text style={s.empty}>No persisted findings for this account.</Text>
            ) : (
              data.findings.map((finding) => (
                <View key={finding.id} style={s.card}>
                  <View style={styles.findingHeader}>
                    <Text style={s.cardTitle}>{finding.title}</Text>
                    <Text style={styles.badge}>{finding.severity.toUpperCase()}</Text>
                  </View>
                  <Text style={s.body}>{finding.explanation}</Text>
                  <Text style={s.metadata}>
                    {finding.type} · {finding.status} · {finding.ruleVersion}
                  </Text>
                  <Text style={s.metadata} numberOfLines={3}>
                    Evidence: {JSON.stringify(finding.evidence)}
                  </Text>
                  <View style={styles.actions}>
                    {finding.status === 'open' ? (
                      <>
                        <Pressable
                          disabled={isActing || !online.hasNetwork || isCachedFallback}
                          onPress={() => void updateStatus(finding.id, 'resolved')}
                          style={s.secondaryButton}
                        >
                          <Text style={s.secondaryButtonText}>Resolve</Text>
                        </Pressable>
                        <Pressable
                          disabled={isActing || !online.hasNetwork || isCachedFallback}
                          onPress={() => void updateStatus(finding.id, 'dismissed')}
                          style={s.secondaryButton}
                        >
                          <Text style={s.secondaryButtonText}>Dismiss</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable
                        disabled={isActing || !online.hasNetwork || isCachedFallback}
                        onPress={() => void updateStatus(finding.id, 'open')}
                        style={s.secondaryButton}
                      >
                        <Text style={s.secondaryButtonText}>Reopen</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </ServerWorkspaceShell>
  );
}

const styles = StyleSheet.create({
  findingHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  badge: { fontSize: 11, fontWeight: '800', opacity: 0.65 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
