import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { useCachedServerResource } from '../../api/useCachedServerResource';
import { DataFreshness } from '../../components/DataFreshness';
import { currentMonth, MonthSelector } from '../../components/MonthSelector';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';

export function AdvancedInsightsScreen() {
  const api = useMemo(() => createServerDerivedApi(), []);
  const [month, setMonth] = useState(currentMonth);
  const loader = useCallback(() => api.getInsightsWorkspace(month), [api, month]);
  const resource = useCachedServerResource(`server:advanced-insights:v1:${month}`, loader);
  const result = resource.data?.insights;
  return <ServerWorkspaceShell active="advanced-insights" title="Advanced Insights"
    subtitle="Understand budget pressure, cash flow and changes in your spending, with the figures behind each insight."
    isRefreshing={resource.isRefreshing}
    onRefresh={() => { void resource.refresh().catch(() => undefined); }}>
    <MonthSelector month={month} onChange={setMonth} />
    {resource.isLoading && !resource.data ? <ActivityIndicator /> : null}
    {resource.error ? <Text style={s.error}>{resource.error}</Text> : null}
    <DataFreshness cachedAt={resource.cachedAt} isCachedFallback={resource.isCachedFallback} />
    {resource.data && !resource.data.entitlements.features.advancedInsights?.enabled ? (
      <View style={s.card}><Text style={s.cardTitle}>Advanced Insights require Premium access</Text>
        <Text style={s.body}>This feature is not enabled for your account.</Text>
        <Text style={s.metadata}>Current plan: {resource.data.entitlements.planTier}</Text></View>
    ) : null}
    {result && result.month === month ? <>
      {result.insights.map((insight) => <View key={insight.id} style={s.card}>
        <Text style={s.metadata}>{insight.priority === 'attention' ? 'Needs attention'
          : insight.priority === 'positive' ? 'Positive trend' : 'For your information'}</Text>
        <Text style={s.cardTitle}>{insight.title}</Text>
        <Text style={s.body}>{insight.summary}</Text>
        {insight.evidence.map((evidence, index) => <View key={`${evidence.reference}:${index}`}>
          {evidence.metrics.map((metric) => <Text key={metric.key} style={s.metadata}>
            {metric.label}: {metric.value}{metric.format === 'currency' ? ' €' : metric.format === 'percent' ? '%' : ''}
          </Text>)}
        </View>)}
      </View>)}
      {result.insights.length === 0 ? <Text style={s.empty}>No insights for this month yet.</Text> : null}
      {result.limitations.length > 0 ? <View style={s.card}><Text style={s.cardTitle}>About these insights</Text>
        {result.limitations.map((text) => <Text key={text} style={s.body}>{text}</Text>)}</View> : null}
    </> : null}
  </ServerWorkspaceShell>;
}
