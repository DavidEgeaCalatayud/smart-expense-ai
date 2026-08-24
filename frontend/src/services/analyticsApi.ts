import type { MonthlyExpensePoint, TransactionSummary } from '../types/transactions';
import { apiFetch } from './apiClient';

export interface SummaryRange {
  dateFrom?: string;
  dateTo?: string;
}

export function fetchTransactionSummary(range: SummaryRange = {}): Promise<TransactionSummary> {
  const params = new URLSearchParams();
  if (range.dateFrom) params.set('dateFrom', range.dateFrom);
  if (range.dateTo) params.set('dateTo', range.dateTo);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiFetch<TransactionSummary>(`/analytics/summary${suffix}`, {}, 'v2');
}

export function fetchMonthlyExpenses(months = 6): Promise<MonthlyExpensePoint[]> {
  const params = new URLSearchParams({ months: String(months) });
  return apiFetch<MonthlyExpensePoint[]>(`/analytics/monthly-expenses?${params.toString()}`, {}, 'v2');
}
