import type { MonthlyReport, ReportEntitlements } from '../types/reports';
import {
  API_V2_BASE_URL,
  ApiNetworkError,
  ApiRequestError,
  apiFetch,
} from './apiClient';

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: unknown;
  };
}

export function fetchReportEntitlements(): Promise<ReportEntitlements> {
  return apiFetch<ReportEntitlements>('/entitlements', {}, 'v2');
}

export function fetchMonthlyReport(month: string): Promise<MonthlyReport> {
  return apiFetch<MonthlyReport>(`/reports/monthly?month=${encodeURIComponent(month)}`, {}, 'v2');
}

export async function downloadMonthlyReport(month: string): Promise<{ blob: Blob; filename: string }> {
  let response: Response;
  try {
    response = await fetch(
      `${API_V2_BASE_URL}/reports/monthly.csv?month=${encodeURIComponent(month)}`,
      {
        credentials: 'include',
        headers: { Accept: 'text/csv' },
      },
    );
  } catch (error) {
    throw new ApiNetworkError(error instanceof Error ? error.message : undefined);
  }

  if (!response.ok) {
    let envelope: ErrorEnvelope = {};
    try {
      envelope = (await response.json()) as ErrorEnvelope;
    } catch {
      // Preserve a typed client error even when an upstream failure is not JSON.
    }
    throw new ApiRequestError(
      envelope.error?.message ?? `Request failed with status ${response.status}`,
      {
        status: response.status,
        code: envelope.error?.code ?? `http_${response.status}`,
        requestId: envelope.error?.requestId ?? response.headers.get('X-Request-ID') ?? undefined,
        details: envelope.error?.details,
      },
    );
  }

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/i);
  return {
    blob: await response.blob(),
    filename: match?.[1] ?? `smart-expense-report-${month}.csv`,
  };
}
