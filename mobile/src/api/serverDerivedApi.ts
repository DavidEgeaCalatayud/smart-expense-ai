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
  ReportEntitlements,
  MonthlyReport,
  AdvancedInsightsResponse,
  BudgetMonth,
} from '@smart-expense-ai/api-contracts';

import { MobileApiClient, getSharedMobileApiClient } from './client';

export class ServerDerivedApi {
  constructor(private readonly client: MobileApiClient) {}

  getEntitlements(): Promise<ReportEntitlements> {
    return this.client.request('/api/v2/entitlements');
  }

  getMonthlyReport(month: string): Promise<MonthlyReport> {
    return this.client.request(`/api/v2/reports/monthly?month=${encodeURIComponent(month)}`);
  }

  getMonthlyReportCsv(month: string): Promise<string> {
    return this.client.requestText(`/api/v2/reports/monthly.csv?month=${encodeURIComponent(month)}`);
  }

  getAdvancedInsights(month: string): Promise<AdvancedInsightsResponse> {
    return this.client.request(`/api/v2/insights/advanced?month=${encodeURIComponent(month)}`);
  }

  async getReportsWorkspace(month: string) {
    const entitlements = await this.getEntitlements();
    const report = entitlements.features.exportableReports?.enabled
      ? await this.getMonthlyReport(month) : null;
    return { entitlements, report };
  }

  async getInsightsWorkspace(month: string) {
    const entitlements = await this.getEntitlements();
    const insights = entitlements.features.advancedInsights?.enabled
      ? await this.getAdvancedInsights(month) : null;
    return { entitlements, insights };
  }

  getBudgetProgress(month: string): Promise<BudgetMonth> {
    return this.client.request(`/api/v2/budgets?month=${encodeURIComponent(month)}`);
  }

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
  return new ServerDerivedApi(getSharedMobileApiClient());
}
