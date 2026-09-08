export interface FeatureEntitlement {
  eligible: boolean;
  enabled: boolean;
}

export interface ReportEntitlements {
  policyVersion: string;
  enforcementMode: string;
  planTier: 'free' | 'premium';
  features: Record<string, FeatureEntitlement>;
}

export interface ReportCategoryBreakdown {
  category: string;
  type: 'expense' | 'income';
  total: string;
  transactionCount: number;
}

export interface MonthlyReport {
  reportVersion: 'monthly-financial-report-v1';
  month: string;
  currency: 'EUR';
  totalIncome: string;
  totalExpenses: string;
  net: string;
  transactionCount: number;
  categoryBreakdown: ReportCategoryBreakdown[];
  downloadFilename: string;
}

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


export interface BudgetDefinition {
  id: string;
  month: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryArchived: boolean;
  limitAmount: string;
}

export interface BudgetProgress extends BudgetDefinition {
  spentAmount: string;
  remainingAmount: string;
  percentUsed: string;
  daysRemaining: number;
  overBudget: boolean;
}

export interface BudgetMonth {
  month: string;
  totalBudget: BudgetProgress | null;
  categoryBudgets: BudgetProgress[];
}
