import Ionicons from '../../ui/Icon';
import type { Href } from 'expo-router';
import { Link } from '../../ui/Link';
import { Pressable, Text, View } from '../../ui/primitives';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import { useOnlineSync } from '../../sync/OnlineSyncProvider';

const insights = [
  ['Intelligence', 'Patterns, unusual spending and subscriptions', '/intelligence', 'sparkles-outline'],
  ['Predictions', 'Month-end forecast and upcoming payments', '/predictions', 'trending-up-outline'],
  ['Historical analysis', 'Understand how your finances have changed', '/historical', 'time-outline'],
  ['Category suggestions', 'Find a category for your next transaction', '/suggestions', 'pricetags-outline'],
  ['Financial assistant', 'Ask questions about your finances', '/assistant', 'chatbubble-ellipses-outline'],
  ['Advanced insights', 'Explore the insights included in your plan', '/advanced-insights', 'analytics-outline'],
] as const;
const more = [
  ['Budgets', 'Set limits and follow your monthly progress', '/budgets', 'wallet-outline'],
  ['Categories', 'Organize your income and expenses', '/categories', 'grid-outline'],
  ['Import CSV', 'Bring in a bank statement with a preview first', '/imports', 'cloud-upload-outline'],
  ['Predictions', 'Forecast and upcoming subscriptions', '/predictions', 'trending-up-outline'],
  ['Historical analysis', 'Monthly trends and spending patterns', '/historical', 'time-outline'],
  ['Financial assistant', 'Ask about your finances', '/assistant', 'chatbubble-ellipses-outline'],
  ['Reports', 'Monthly summaries and CSV export', '/reports', 'document-text-outline'],
  ['Account & security', 'Password, privacy, app lock and notifications', '/account', 'shield-checkmark-outline'],
  ['Settings', 'Appearance, currency and app information', '/settings', 'settings-outline'],
] as const;
export function NavigationHub({ area }: { area: 'insights' | 'more' }) {
  const { syncNow, isSyncing } = useOnlineSync();
  return <ServerWorkspaceShell active={area} title={area === 'insights' ? 'Insights' : 'More'}
    subtitle={area === 'insights' ? 'A clearer view of where your money is going.' : 'Your tools, preferences and account.'}
    isRefreshing={isSyncing} onRefresh={() => void syncNow().catch(() => undefined)}>
    {(area === 'insights' ? insights : more).map(([title, description, href, icon]) =>
      <Link key={href} href={href as Href} asChild><Pressable accessibilityRole="button" style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <Ionicons name={icon} size={26} color="#125c47" />
        <View style={{ flex: 1, gap: 4 }}><Text style={s.cardTitle}>{title}</Text><Text style={s.metadata}>{description}</Text></View>
        <Ionicons name="chevron-forward" size={18} color="#596575" />
      </Pressable></Link>)}
    {area === 'more' ? <View style={s.card}>
      <Text style={s.cardTitle}>Add an expense without searching</Text>
      <Text style={s.body}>On your Android home screen, hold an empty space, open Widgets, and choose Smart Expense AI. You can also hold the app icon for Add expense and Add income shortcuts.</Text>
      <Link href="/transactions?quickAdd=expense" asChild><Pressable accessibilityRole="button" style={s.primaryButton}><Text style={s.primaryButtonText}>Quick add expense</Text></Pressable></Link>
    </View> : null}
  </ServerWorkspaceShell>;
}
