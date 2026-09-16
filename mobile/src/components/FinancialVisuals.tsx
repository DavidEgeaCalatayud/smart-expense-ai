import type { IntelligenceFindingResponse, SpendingForecastResponse, UpcomingPaymentItem } from '@smart-expense-ai/api-contracts';
import Icon from '../ui/Icon';
import { ScrollView, Text, View } from '../ui/primitives';
import { money } from '../features/home/financialFormat';
import { preferredForecast } from '../features/home/homeData';
import { serverWorkspaceStyles as s } from './ServerWorkspaceShell';
export { money } from '../features/home/financialFormat';

export function ProgressMeter({ percent, label }: { percent: string; label: string }) {
  const value = Number(percent);
  const width = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: width, text: `${percent}%` }}
    style={{ height: 10, borderRadius: 5, backgroundColor: '#e7ece9', overflow: 'hidden' }}>
    <View style={{ height: 10, width: `${width}%`, borderRadius: 5, backgroundColor: value >= 100 ? '#b42318' : '#17765a' }} />
  </View>;
}
export function ForecastVisual({ forecast }: { forecast: SpendingForecastResponse }) {
  const best = preferredForecast(forecast);
  const estimate = best?.projectedMonthEnd;
  const ratio = estimate && Number(estimate) > 0 ? Math.max(0, Math.min(1, Number(forecast.spentSoFar) / Number(estimate))) : 0;
  return <View style={[s.card, { gap: 16 }]}>
    <View style={[s.row, { alignItems: 'center' }]}><Icon name="trending-up-outline" size={26} color="#125c47" /><Text style={s.cardTitle}>Month-end forecast</Text></View>
    <Text style={{ fontSize: 36, fontWeight: '800' }}>{estimate ? money(estimate) : 'Not enough history'}</Text>
    <Text style={s.metadata}>{best?.label ?? 'Add more transactions to build a forecast.'}</Text>
    {estimate ? <View accessibilityLabel={`Spent ${forecast.spentSoFar} euros. Projected month-end ${estimate} euros.`} style={{ flexDirection: 'row', height: 24, gap: 4 }}>
      <View style={{ flex: ratio, backgroundColor: '#17765a', borderRadius: 6 }} />
      <View style={{ flex: 1 - ratio, borderColor: '#17765a', borderWidth: 2, borderStyle: 'dashed', borderRadius: 6 }} />
    </View> : null}
    <View style={[s.row, { justifyContent: 'space-between' }]}>
      <View style={{ flex: 1 }}><Text style={s.metadata}>● Spent so far</Text><Text style={s.cardTitle}>{money(forecast.spentSoFar)}</Text></View>
      <View style={{ flex: 1 }}><Text style={s.metadata}>◌ Estimated month-end</Text><Text style={s.cardTitle}>{estimate ? money(estimate) : '—'}</Text></View>
    </View>
    <Text style={s.metadata}>{forecast.remainingDays} days left. Estimates can change as new activity arrives.</Text>
  </View>;
}
export function SubscriptionRow({ payment }: { payment: UpcomingPaymentItem }) {
  const warning = payment.status === 'price_changed' || payment.status === 'overdue';
  return <View style={[s.card, { gap: 12 }]}>
    <View style={[s.row, { alignItems: 'center' }]}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#e1f4e9', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20, fontWeight: '800', color: '#125c47' }}>{payment.merchant.slice(0, 1).toUpperCase()}</Text></View>
      <View style={{ flex: 1, gap: 4 }}><Text style={s.cardTitle}>{payment.merchant}</Text><Text style={s.metadata}>{new Date(`${payment.expectedDate}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Text></View>
      <Text style={s.cardTitle}>{money(payment.expectedAmount)}</Text>
    </View>
    <Text style={{ color: warning ? '#b42318' : '#125c47', fontSize: 13, fontWeight: '700' }}>{warning ? '⚠' : '●'} {payment.status.replaceAll('_', ' ')}</Text>
    {warning ? <Text style={s.metadata}>{payment.explanation}</Text> : null}
  </View>;
}
const FINDING_LABELS = {
  recurring_pattern: 'Recurring pattern', recurring_payment_missing: 'Missing payment', duplicate_subscription: 'Possible duplicate subscription',
  spending_anomaly: 'Unusual spending', frequency_anomaly: 'Unusual frequency',
};
export function FindingHeading({ finding }: { finding: IntelligenceFindingResponse }) {
  const warning = finding.severity !== 'info';
  return <View style={[s.row, { alignItems: 'flex-start' }]}>
    <View style={{ backgroundColor: warning ? '#fff7ed' : '#e1f4e9', padding: 10, borderRadius: 12 }}><Icon name={warning ? 'alert-circle-outline' : 'sparkles-outline'} size={24} color={warning ? '#b42318' : '#125c47'} /></View>
    <View style={{ flex: 1, gap: 5 }}><Text style={s.metadata}>{FINDING_LABELS[finding.type]}</Text><Text style={s.cardTitle}>{finding.title}</Text></View>
  </View>;
}
export function MonthBars({ points }: { points: { month: string; amount: string; isComplete?: boolean }[] }) {
  const max = Math.max(1, ...points.map((point) => Number(point.amount)));
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingVertical: 16 }}>
    {points.map((point) => <View key={point.month} accessibilityLabel={`${point.month}: ${point.amount} euros${point.isComplete === false ? ', incomplete month' : ''}`} style={{ alignItems: 'center', gap: 8, width: 68 }}>
      <Text style={{ fontSize: 11 }}>{money(point.amount)}</Text>
      <View style={{ height: 104, width: 34, justifyContent: 'flex-end' }}><View style={{ height: Math.max(2, Number(point.amount) / max * 104), backgroundColor: '#17765a', borderRadius: 7, opacity: point.isComplete === false ? 0.5 : 1 }} /></View>
      <Text style={s.metadata}>{new Date(`${point.month}-15T12:00:00`).toLocaleDateString(undefined, { month: 'short' })}</Text>
    </View>)}
  </ScrollView>;
}
