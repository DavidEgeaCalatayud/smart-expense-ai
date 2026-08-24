import { apiFetch } from './apiClient';
import type { HistoricalAnalysis } from '../types/historicalAnalysis';


export async function runHistoricalAnalysis(months = 12): Promise<HistoricalAnalysis> {
  return apiFetch<HistoricalAnalysis>(`/intelligence/historical-analysis?months=${months}`, { method: 'POST' }, 'v2');
}

export async function fetchLatestHistoricalAnalysis(): Promise<HistoricalAnalysis> {
  return apiFetch<HistoricalAnalysis>('/intelligence/historical-analysis/latest', {}, 'v2');
}
