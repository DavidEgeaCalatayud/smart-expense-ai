import type { HomeData } from '../src/features/home/homeData';
import { DEFAULT_NOTIFICATIONS, notificationPlan, type NotificationState } from '../src/notifications/notificationPolicy';
const empty: HomeData = { summary: null, monthly: null, budgets: null, forecast: null, upcoming: null, findings: null, partial: false };
const enabled = (): NotificationState => ({ ...DEFAULT_NOTIFICATIONS, enabled: true, seen: {}, scheduled: {} });
const forecast = (amount: string) => ({ ...empty, forecast: { month: '2026-09', baselines: [{ baseline: 'recurrence_aware', available: true, projectedMonthEnd: amount }] } as HomeData['forecast'] });

it('requires opt-in and establishes a baseline without a forecast alert', () => {
  expect(notificationPlan(forecast('100.00'), DEFAULT_NOTIFICATIONS).notifications).toEqual([]);
  const first = notificationPlan(forecast('100.00'), enabled());
  expect(first.notifications).toEqual([]);
  expect(first.forecast).toEqual({ month: '2026-09', amount: '100.00' });
});
it('detects cumulative forecast changes at exactly ten percent using integer money', () => {
  const state = { ...enabled(), forecast: { month: '2026-09', amount: '100.10' } };
  expect(notificationPlan(forecast('110.10'), state).notifications).toHaveLength(0);
  expect(notificationPlan(forecast('110.11'), state).notifications).toHaveLength(1);
  expect(notificationPlan(forecast('90.09'), state).notifications).toHaveLength(1);
  expect(notificationPlan(forecast('0.50'), { ...state, forecast: { month: '2026-09', amount: '0.10' } }).notifications).toHaveLength(0);
});
it('does not announce a lower budget threshold after already alerting at 100%', () => {
  const data = { ...empty, budgets: { month: '2026-09', totalBudget: { id: 'b', month: '2026-09', percentUsed: '81.00', categoryName: null, spentAmount: '81.00', limitAmount: '100.00' }, categoryBudgets: [] } as unknown as HomeData['budgets'] };
  expect(notificationPlan(data, enabled()).notifications).toHaveLength(1);
  const state = enabled(); state.seen['budget:2026-09:b:100'] = '2026-09-09';
  expect(notificationPlan(data, state).notifications).toHaveLength(0);
});
it('schedules upcoming reminders in local calendar time and keeps financial details out of notifications', () => {
  const data = { ...empty, upcoming: { upcomingPayments: [{ streamKey: 'private-stream', merchant: 'Private merchant', expectedAmount: '1234.56', expectedDate: '2026-09-11' }] } as HomeData['upcoming'] };
  const result = notificationPlan(data, enabled(), new Date('2026-09-09T10:00:00'));
  expect(result.notifications[0]?.at).toBe(new Date('2026-09-10T09:00:00').toISOString());
  expect(result.notifications[0]?.body).not.toContain('Private merchant');
  expect(result.notifications[0]?.body).not.toContain('1234.56');
  expect(notificationPlan(data, enabled(), new Date('2026-09-12T10:00:00')).notifications).toEqual([]);
});
