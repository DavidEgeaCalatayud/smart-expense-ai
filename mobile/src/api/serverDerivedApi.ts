import type {
  CategorySuggestionPreviewResponse,
  FinancialAssistantAnswer,
  FindingStatus,
  FindingType,
  HistoricalAnalysisResponseV22,
  IntelligenceFindingResponse,
  IntelligenceScanResponse,
  IntelligenceSummaryResponse,
  MonthlyExpensePointV2,
  SpendingForecastResponse,
  TransactionSummaryV2,
  UpcomingPaymentsResponse,
} from '@smart-expense-ai/api-contracts';

import { MobileApiClient } from './client';
import { getMobileApiBaseUrl } from './config';

export class ServerDerivedApi {
  constructor(private readonly client: MobileApiClient) {}

  getSummary(): Promise<TransactionSummaryV2> {
    return this.client.request<TransactionSummaryV2>('/api/v2/analytics/summary');
  }

  getMonthlyExpenses(months = 6): Promise<MonthlyExpensePointV2[]> {
    return this.client.request<MonthlyExpensePointV2[]>(
      `/api/v2/analytics/monthly-expenses?months=${encodeURIComponent(String(months))}`,
    );
  }

  getIntelligenceSummary(): Promise<IntelligenceSummaryResponse> {
    return this.client.request<IntelligenceSummaryResponse>('/api/v2/intelligence/summary');
  }

  getIntelligenceFindings(filters: {
    status?: FindingStatus;
    type?: FindingType;
  } = {}): Promise<IntelligenceFindingResponse[]> {
    const query = new URLSearchParams();
    if (filters.status) query.set('status', filters.status);
    if (filters.type) query.set('type', filters.type);
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return this.client.request<IntelligenceFindingResponse[]>(
      `/api/v2/intelligence/findings${suffix}`,
    );
  }

  runIntelligenceScan(): Promise<IntelligenceScanResponse> {
    return this.client.request<IntelligenceScanResponse>('/api/v2/intelligence/scan', {
      method: 'POST',
    });
  }

  updateFindingStatus(
    findingId: string,
    status: FindingStatus,
  ): Promise<IntelligenceFindingResponse> {
    return this.client.request<IntelligenceFindingResponse>(
      `/api/v2/intelligence/findings/${encodeURIComponent(findingId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
    );
  }

  getLatestHistoricalAnalysis(): Promise<HistoricalAnalysisResponseV22> {
    return this.client.request<HistoricalAnalysisResponseV22>(
      '/api/v2/intelligence/historical-analysis/latest',
    );
  }

  runHistoricalAnalysis(months = 12): Promise<HistoricalAnalysisResponseV22> {
    return this.client.request<HistoricalAnalysisResponseV22>(
      `/api/v2/intelligence/historical-analysis?months=${encodeURIComponent(String(months))}`,
      { method: 'POST' },
    );
  }

  getUpcomingPayments(days = 30): Promise<UpcomingPaymentsResponse> {
    return this.client.request<UpcomingPaymentsResponse>(
      `/api/v2/intelligence/upcoming-payments?days=${encodeURIComponent(String(days))}`,
    );
  }

  getSpendingForecast(asOf?: string): Promise<SpendingForecastResponse> {
    const suffix = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
    return this.client.request<SpendingForecastResponse>(
      `/api/v2/analytics/spending-forecast${suffix}`,
    );
  }

  previewCategorySuggestion(
    merchant: string,
    type: 'expense' | 'income',
  ): Promise<CategorySuggestionPreviewResponse> {
    return this.client.request<CategorySuggestionPreviewResponse>(
      '/api/v2/category-suggestions/preview',
      {
        method: 'POST',
        body: JSON.stringify({ merchant: merchant.trim(), type }),
      },
    );
  }

  queryAssistant(question: string): Promise<FinancialAssistantAnswer> {
    return this.client.request<FinancialAssistantAnswer>('/api/v2/assistant/query', {
      method: 'POST',
      body: JSON.stringify({ question: question.trim() }),
    });
  }
}

export function createServerDerivedApi(): ServerDerivedApi {
  return new ServerDerivedApi(new MobileApiClient(getMobileApiBaseUrl()));
}
