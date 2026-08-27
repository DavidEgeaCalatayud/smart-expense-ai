import { apiFetch } from './apiClient';
import type { SpendingForecastResponse } from '../types/spendingForecast';


export async function fetchSpendingForecast(asOf?: string): Promise<SpendingForecastResponse> {
  const query = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
  return apiFetch<SpendingForecastResponse>(`/analytics/spending-forecast${query}`, {}, 'v2');
}
