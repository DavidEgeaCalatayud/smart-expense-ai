import { apiFetch } from './apiClient';
import type { UpcomingPaymentsResponse } from '../types/upcomingPayments';


export async function fetchUpcomingPayments(days = 30): Promise<UpcomingPaymentsResponse> {
  return apiFetch<UpcomingPaymentsResponse>(`/intelligence/upcoming-payments?days=${days}`, {}, 'v2');
}
