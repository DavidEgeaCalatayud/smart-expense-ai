import { MobileApiHttpError } from '../../api/client';
import type { ServerDerivedApi } from '../../api/serverDerivedApi';

export async function loadHomeData(api: ServerDerivedApi, month: string) {
  const [summary, monthly, budgets, forecast, upcoming, findings] = await Promise.allSettled([
    api.getSummary(), api.getMonthlyExpenses(2), api.getBudgetProgress(month),
    api.getSpendingForecast(), api.getUpcomingPayments(30), api.getIntelligenceFindings({ status: 'open' }),
  ]);
  const results = [summary, monthly, budgets, forecast, upcoming, findings];
  const denied = results.find((result) => result.status === 'rejected' && result.reason instanceof MobileApiHttpError && [401, 403].includes(result.reason.status));
  if (denied?.status === 'rejected') throw denied.reason;
  if (results.every((result) => result.status === 'rejected')) {
    throw summary.status === 'rejected' ? summary.reason : new Error('Unable to refresh Home');
  }
  return {
    summary: summary.status === 'fulfilled' ? summary.value : null,
    monthly: monthly.status === 'fulfilled' ? monthly.value : null,
    budgets: budgets.status === 'fulfilled' ? budgets.value : null,
    forecast: forecast.status === 'fulfilled' ? forecast.value : null,
    upcoming: upcoming.status === 'fulfilled' ? upcoming.value : null,
    findings: findings.status === 'fulfilled' ? findings.value : null,
    partial: results.some((result) => result.status === 'rejected'),
  };
}
export type HomeData = Awaited<ReturnType<typeof loadHomeData>>;
export function preferredForecast(data: HomeData['forecast']) {
  return data?.baselines.find((item) => item.baseline === 'recurrence_aware' && item.available)
    ?? data?.baselines.find((item) => item.available);
}
