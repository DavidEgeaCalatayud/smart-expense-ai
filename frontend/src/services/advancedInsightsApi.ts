import type { ReportEntitlements } from '../types/reports';
import type { AdvancedInsightsResponse } from '../types/advancedInsights';
import { apiFetch } from './apiClient';


export function fetchAdvancedInsightEntitlements(): Promise<ReportEntitlements> {
  return apiFetch<ReportEntitlements>('/entitlements', {}, 'v2');
}

export function fetchAdvancedInsights(month: string): Promise<AdvancedInsightsResponse> {
  return apiFetch<AdvancedInsightsResponse>(
    `/insights/advanced?month=${encodeURIComponent(month)}`,
    {},
    'v2',
  );
}
