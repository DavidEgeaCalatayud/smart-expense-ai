import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { Link } from '../../ui/Link';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from '../../ui/primitives';
import { useAuth } from '../../auth/AuthProvider';
import { FindingHeading, ForecastVisual, ProgressMeter, SubscriptionRow, money } from '../../components/FinancialVisuals';
import { expenseChange } from '../home/financialFormat';
import { DataFreshness } from '../../components/DataFreshness';
import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { useCachedServerResource } from '../../api/useCachedServerResource';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import { useForegroundSync } from '../../sync/useForegroundSync';
import { useTransactions } from '../transactions/useTransactions';
import { localDate } from '../transactions/validation';
import { loadHomeData } from '../home/homeData';

export function DashboardScreen() {
  const { user } = useAuth();
  const greeting = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 18 ? 'Buenas tardes' : 'Buenas noches';
  const api = useMemo(() => createServerDerivedApi(), []);
  const month = localDate().slice(0, 7);
  const loader = useCallback(() => loadHomeData(api, month), [api, month]);
  const { data, isLoading, isRefreshing, error, refresh, cachedAt, isCachedFallback } =
    useCachedServerResource(`server:home:v2:${month}`, loader);
  const { transactions, reload } = useTransactions({}, 5);
  const { health } = useForegroundSync(reload);
  const monthSpending = data?.monthly?.find((item) => item.month === month)?.amount
    ?? null;
  const previousDate = new Date(`${month}-15T12:00:00`); previousDate.setMonth(previousDate.getMonth() - 1);
  const previousMonth = localDate(previousDate).slice(0, 7);
  const previousSpending = data?.monthly?.find((item) => item.month === previousMonth)?.amount;
  const change = monthSpending !== null && previousSpending ? expenseChange(monthSpending, previousSpending) : null;
  const budgets = data?.budgets ? [data.budgets.totalBudget, ...data.budgets.categoryBudgets].filter((item) => item !== null) : [];
  return <ServerWorkspaceShell active="dashboard" title={`${greeting}, ${user?.displayName.split(' ')[0] ?? 'hola'}`} subtitle="Tu mes, de un vistazo."
    isRefreshing={isRefreshing} onRefresh={() => void refresh().catch(() => undefined)}>
    {isLoading && !data ? <ActivityIndicator size="large" /> : null}
    {error ? <Text style={isCachedFallback ? s.metadata : s.error}>{error}</Text> : null}
    <DataFreshness cachedAt={cachedAt} isCachedFallback={isCachedFallback} />
    {data?.partial ? <Text style={s.metadata}>Some sections could not refresh. Pull down to try again.</Text> : null}
    <View style={styles.hero}>
      <Text style={styles.heroLabel}>Gastado este mes · {new Date(`${month}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long' })}</Text>
      <Text style={styles.heroAmount}>{monthSpending === null ? '—' : money(monthSpending)}</Text>
      {change ? <Text style={styles.heroLabel}>{change} frente a {previousDate.toLocaleDateString(undefined, { month: 'long' })} (mes completo)</Text> : null}
      <Text style={styles.heroLabel}>Balance · {data?.summary ? money(data.summary.balance) : '—'}</Text>
      {health.queued + health.sending + health.failed + health.conflicts > 0 ?
        <Text style={styles.heroLabel}>Los cambios pendientes aparecerán en los totales al sincronizarse.</Text> : null}
      <Link href="/transactions?quickAdd=expense" asChild><Pressable accessibilityRole="button" style={styles.add}>
        <Text style={styles.addText}>+ Añadir movimiento</Text>
      </Pressable></Link>
    </View>
    <View style={s.section}>
      <Text style={s.sectionTitle}>Progreso de presupuestos</Text>
      {budgets.slice(0, 3).map((budget) => <View style={s.card} key={budget.id}>
        <Text style={s.cardTitle}>{budget.categoryName ?? 'Presupuesto mensual'}</Text>
        <Text style={s.body}>{budget.spentAmount} € de {budget.limitAmount} € · {budget.percentUsed}%</Text>
        <ProgressMeter label={budget.categoryName ?? 'Presupuesto mensual'} percent={budget.percentUsed} />
        <Text style={s.metadata}>{budget.overBudget ? 'Presupuesto superado' : `${budget.remainingAmount} € restantes`}</Text>
      </View>)}
      {budgets.length === 0 ? <Text style={s.empty}>{data?.budgets ? 'Crea un presupuesto para planificar tu mes.' : 'Progreso de presupuestos will appear after connecting.'}</Text> : null}
      <Link href="/budgets" style={styles.link}>Gestionar presupuestos →</Link>
    </View>
    {data?.forecast ? <ForecastVisual forecast={data.forecast} /> : <View style={s.card}><Text style={s.cardTitle}>Previsión de fin de mes</Text><Text style={s.empty}>Conéctate para consultar la previsión.</Text></View>}
    <Link href="/predictions" style={styles.link}>Explorar previsión →</Link>
    <View style={s.section}>
      <Text style={s.sectionTitle}>Próximos pagos</Text>
      {data?.upcoming?.upcomingPayments.slice(0, 3).map((payment) => <SubscriptionRow key={`${payment.streamKey}:${payment.expectedDate}`} payment={payment} />)}
      {!data?.upcoming?.upcomingPayments.length ? <Text style={s.empty}>{data?.upcoming ? 'No se han detectado próximos pagos.' : 'Conéctate para consultar próximos pagos.'}</Text> : null}
      <Link href="/predictions" style={styles.link}>Ver próximos pagos →</Link>
    </View>
    <View style={s.section}>
      <Text style={s.sectionTitle}>Análisis inteligentes</Text>
      {data?.findings?.slice(0, 3).map((finding) => <View key={finding.id} style={s.card}><FindingHeading finding={finding} /><Text style={s.body}>{finding.explanation}</Text></View>)}
      {!data?.findings?.length ? <Text style={s.empty}>{data?.findings ? 'No hay avisos pendientes.' : 'Conéctate para actualizar los análisis.'}</Text> : null}
      <Link href="/intelligence" style={styles.link}>Abrir inteligencia →</Link>
    </View>
    <View style={s.section}>
      <Text style={s.sectionTitle}>Movimientos recientes</Text>
      {transactions.map((item) => <View key={item.id} style={s.card}>
        <View style={s.row}><Text style={[s.cardTitle, { flex: 1 }]}>{item.merchant}</Text><Text style={[s.cardTitle, item.transaction_type === 'income' && styles.income]}>{item.transaction_type === 'income' ? '+' : '−'}{minorUnitsToDecimal(item.amount_minor)} €</Text></View>
        <Text style={s.metadata}>{item.category_name} · {item.transaction_date}{item.sync_status !== 'synced' ? ' · Pendiente de sincronizar' : ''}</Text>
      </View>)}
      {!transactions.length ? <Text style={s.empty}>Tus últimos movimientos aparecerán aquí.</Text> : null}
      <Link href="/transactions" style={styles.link}>Ver actividad →</Link>
    </View>
  </ServerWorkspaceShell>;
}
const styles = StyleSheet.create({
  hero: { backgroundColor: '#125c47', borderRadius: 24, padding: 24, gap: 12 },
  heroLabel: { color: '#e1f4e9', fontSize: 14, lineHeight: 21 },
  heroAmount: { color: '#fff', fontSize: 42, fontWeight: '800' },
  add: { backgroundColor: '#e1f4e9', borderRadius: 12, padding: 14, marginTop: 6, alignItems: 'center' },
  addText: { color: '#125c47', fontWeight: '800', fontSize: 15 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#e7ece9', overflow: 'hidden', marginVertical: 4 },
  progress: { height: 8, borderRadius: 4 }, link: { color: '#125c47', fontWeight: '700', paddingVertical: 12 },
  income: { color: '#125c47' },
});
