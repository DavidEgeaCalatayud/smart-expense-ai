import { decimalToMinorUnits } from '@smart-expense-ai/domain-types';
import type { HomeData } from '../features/home/homeData';
import { money } from '../features/home/financialFormat';
import { preferredForecast } from '../features/home/homeData';

export type NotificationKind = 'upcoming' | 'budget' | 'anomaly' | 'forecast';
export interface NotificationPreferences { enabled: boolean; showDetails?: boolean; kinds: Record<NotificationKind, boolean> }
export interface NotificationState extends NotificationPreferences {
  seen: Record<string, string>;
  scheduled: Record<string, { key: string; kind: NotificationKind; at: string }>;
  forecast: { month: string; amount: string } | null;
}
export const DEFAULT_NOTIFICATIONS: NotificationState = {
  enabled: false, kinds: { upcoming: true, budget: true, anomaly: true, forecast: true },
  seen: {}, scheduled: {}, forecast: null,
};
export interface FinancialNotification {
  key: string; kind: NotificationKind; title: string; body: string;
  route: '/predictions' | '/budgets' | '/intelligence'; at: string | null;
  details?: { title: string; body: string };
}

// Decisions use canonical server results. Financial details require explicit opt-in at delivery.
export function notificationPlan(data: HomeData, state: NotificationState, now = new Date()) {
  const notifications: FinancialNotification[] = [];
  if (!state.enabled) return { notifications, forecast: state.forecast };
  if (state.kinds.upcoming && data.upcoming) {
    for (const payment of data.upcoming.upcomingPayments.slice(0, 32)) {
      const due = new Date(`${payment.expectedDate}T09:00:00`);
      if (!Number.isFinite(due.getTime())) continue;
      const reminder = new Date(due); reminder.setDate(reminder.getDate() - 1);
      const endOfDueDay = new Date(due); endOfDueDay.setHours(23, 59, 59, 999);
      if (endOfDueDay < now) continue;
      notifications.push({ key: `upcoming:${payment.streamKey}:${payment.expectedDate}`, kind: 'upcoming',
        title: 'Upcoming subscription', body: 'A recurring payment is coming up. Open Smart Expense AI to review it.',
        route: '/predictions', at: reminder > now ? reminder.toISOString() : null,
        details: { title: `${payment.merchant} · ${money(payment.expectedAmount)}`, body: `Recurring payment expected on ${payment.expectedDate}.` } });
    }
  }
  if (state.kinds.budget && data.budgets) {
    for (const budget of [data.budgets.totalBudget, ...data.budgets.categoryBudgets]) {
      if (!budget) continue;
      const used = Number(budget.percentUsed);
      const threshold = used >= 100 ? 100 : used >= 80 ? 80 : null;
      if (threshold === 80 && state.seen[`budget:${budget.month}:${budget.id}:100`]) continue;
      if (threshold) notifications.push({ key: `budget:${budget.month}:${budget.id}:${threshold}`, kind: 'budget',
        title: 'Budget threshold reached', body: 'One of your budgets needs a look. Open Smart Expense AI to check your progress.', route: '/budgets', at: null, details: { title: `${budget.categoryName ?? 'Monthly budget'} · ${budget.percentUsed}% used`, body: `${money(budget.spentAmount)} spent of ${money(budget.limitAmount)}.` } });
    }
  }
  if (state.kinds.anomaly && data.findings) {
    for (const finding of data.findings.filter((item) => item.status === 'open' && ['spending_anomaly', 'frequency_anomaly'].includes(item.type)).slice(0, 10)) {
      notifications.push({ key: `anomaly:${finding.id}`, kind: 'anomaly', title: 'Unusual activity detected',
        body: 'There is a new spending finding to review in Smart Expense AI.', route: '/intelligence', at: null, details: { title: finding.title, body: finding.explanation } });
    }
  }
  const baseline = preferredForecast(data.forecast);
  const current = baseline?.projectedMonthEnd && data.forecast ? { month: data.forecast.month, amount: baseline.projectedMonthEnd } : null;
  let forecast = state.forecast;
  if (current) {
    if (state.kinds.forecast && state.forecast?.month === current.month) {
      const previous = BigInt(decimalToMinorUnits(state.forecast.amount));
      const amount = BigInt(decimalToMinorUnits(current.amount));
      const delta = amount > previous ? amount - previous : previous - amount;
      // Notify once a day after a meaningful change, using exact minor units.
      if (previous > 0n && delta >= 100n && delta * 10n >= previous) {
        notifications.push({ key: `forecast:${current.month}:${now.toISOString().slice(0, 10)}`, kind: 'forecast',
          title: 'Your forecast has changed', body: 'Your month-end spending estimate has changed. Open Smart Expense AI to review it.',
          route: '/predictions', at: null, details: { title: `Month-end estimate: ${money(current.amount)}`, body: 'Your forecast changed by at least 10%. Review the new estimate.' } });
        forecast = current;
      }
    } else forecast = current;
  }
  return { notifications, forecast };
}
