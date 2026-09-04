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
