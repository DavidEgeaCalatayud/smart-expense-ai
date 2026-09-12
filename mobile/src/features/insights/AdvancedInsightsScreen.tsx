import { ProgressMeter, money } from '../../components/FinancialVisuals';
import Icon from '../../ui/Icon';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from '../../ui/primitives';

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
      {result.insights.map((insight) => {
        const metrics = insight.evidence.flatMap((entry) => entry.metrics);
        const headline = metrics.find((metric) => metric.key === 'expenseChangePercent')
          ?? metrics.find((metric) => metric.format === 'percent') ?? metrics.find((metric) => metric.key === 'net')
          ?? metrics.find((metric) => metric.format === 'currency' || metric.format === 'count');
        return <View key={insight.id} style={[s.card, { gap: 14, padding: 20 }]}>
        <View style={[s.row, { alignItems: 'center' }]}><Icon name={insight.kind === 'budget_pressure' ? 'wallet-outline' : insight.kind === 'expense_change' ? 'trending-up-outline' : 'sparkles-outline'} size={28} color={insight.priority === 'attention' ? '#b42318' : '#125c47'} />
        <Text style={[s.cardTitle, { flex: 1 }]}>{insight.title}</Text></View>
        {headline ? <Text style={{ fontSize: 36, fontWeight: '800', color: insight.priority === 'attention' ? '#b42318' : '#125c47' }}>{headline.format === 'currency' ? money(headline.value) : `${Number(headline.value) > 0 && insight.kind === 'expense_change' ? '+' : ''}${headline.value}${headline.format === 'percent' ? '%' : ''}`}</Text> : null}
        {headline?.format === 'percent' && ['budget_pressure', 'category_concentration'].includes(insight.kind) ? <ProgressMeter label={headline.label} percent={headline.value} /> : null}
        <Text style={s.metadata}>{insight.priority === 'attention' ? 'Needs attention'
          : insight.priority === 'positive' ? 'Positive trend' : 'For your information'}</Text>
        <Text style={s.body}>{insight.summary}</Text>
        {insight.evidence.map((evidence, index) => <View key={`${evidence.reference}:${index}`}>
          {evidence.metrics.map((metric) => <Text key={metric.key} style={s.metadata}>
            {metric.label}: {metric.value}{metric.format === 'currency' ? ' €' : metric.format === 'percent' ? '%' : ''}
          </Text>)}
        </View>)}
      </View>; })}
      {result.insights.length === 0 ? <Text style={s.empty}>No insights for this month yet.</Text> : null}
      {result.limitations.length > 0 ? <View style={s.card}><Text style={s.cardTitle}>About these insights</Text>
        {result.limitations.map((text) => <Text key={text} style={s.body}>{text}</Text>)}</View> : null}
    </> : null}
  </ServerWorkspaceShell>;
}
