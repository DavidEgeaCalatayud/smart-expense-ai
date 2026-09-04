export type AdvancedInsightKind =
  | 'budget_pressure'
  | 'open_findings'
  | 'cash_flow'
  | 'expense_change'
  | 'category_concentration';

export type AdvancedInsightPriority = 'attention' | 'positive' | 'info';
export type AdvancedInsightMetricFormat = 'currency' | 'percent' | 'count' | 'text';

export interface AdvancedInsightMetric {
  key: string;
  label: string;
  value: string;
  format: AdvancedInsightMetricFormat;
}

export interface AdvancedInsightEvidence {
  source: string;
  reference: string;
  metrics: AdvancedInsightMetric[];
}

export interface AdvancedInsightCard {
  id: string;
  kind: AdvancedInsightKind;
  priority: AdvancedInsightPriority;
  title: string;
  summary: string;
  evidence: AdvancedInsightEvidence[];
}

export interface AdvancedInsightsResponse {
  insightVersion: 'advanced-financial-insights-v1';
  month: string;
  currency: 'EUR';
  insights: AdvancedInsightCard[];
  sourceContracts: Record<string, string>;
  limitations: string[];
}
