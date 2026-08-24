import { apiFetch } from './apiClient';
import type {
  FindingStatus,
  FindingType,
  IntelligenceFinding,
  IntelligenceScanResult,
  IntelligenceSummary,
} from '../types/intelligence';

export async function fetchIntelligenceSummary(): Promise<IntelligenceSummary> {
  return apiFetch<IntelligenceSummary>('/intelligence/summary', {}, 'v2');
}

export async function fetchIntelligenceFindings(filters: {
  status?: FindingStatus;
  type?: FindingType;
} = {}): Promise<IntelligenceFinding[]> {
  const query = new URLSearchParams();
  if (filters.status) query.set('status', filters.status);
  if (filters.type) query.set('type', filters.type);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return apiFetch<IntelligenceFinding[]>(`/intelligence/findings${suffix}`, {}, 'v2');
}

export async function runIntelligenceScan(): Promise<IntelligenceScanResult> {
  return apiFetch<IntelligenceScanResult>('/intelligence/scan', { method: 'POST' }, 'v2');
}

export async function updateIntelligenceFindingStatus(
  findingId: string,
  status: FindingStatus,
): Promise<IntelligenceFinding> {
  return apiFetch<IntelligenceFinding>(`/intelligence/findings/${findingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }, 'v2');
}
