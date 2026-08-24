import type { MoneyAmount } from './transactions';

export type HistoricalTrendDirection = 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';

export interface HistoricalMonthlySpend {
  month: string;
  amount: MoneyAmount;
}

export interface HistoricalTrend {
  direction: HistoricalTrendDirection;
  monthlySlope: MoneyAmount;
  averageMonthlySpend: MoneyAmount;
  rSquared: string;
  activeMonths: number;
}

export interface HistoricalRecurringProfile {
  merchant: string;
  cadence: string;
  occurrenceCount: number;
  medianAmount: MoneyAmount;
  medianIntervalDays: string;
  intervalRegularity: string;
  amountStability: string;
  cadenceFit: string;
  historyDepth: string;
  patternScore: string;
  nextExpectedDate: string;
}

export interface HistoricalOutlier {
  transactionId: string;
  merchant: string;
  category: string;
  date: string;
  amount: MoneyAmount;
  baselineScope: 'merchant' | 'category';
  baselineCount: number;
  baselineMedian: MoneyAmount;
  robustSpread: MoneyAmount;
  deviationScore: string;
}

export interface HistoricalCategoryShift {
  category: string;
  direction: 'increasing' | 'decreasing' | 'stable';
  previousThreeMonthAverage: MoneyAmount;
  currentThreeMonthAverage: MoneyAmount;
  delta: MoneyAmount;
  percentChange: string | null;
}

export interface HistoricalCoverage {
  transactionCount: number;
  activeMonths: number;
  merchantsWithBaseline: number;
  categoriesWithBaseline: number;
  recurringProfiles: number;
  outlierCount: number;
}

export interface HistoricalAnalysis {
  snapshotId: string;
  analysisVersion: string;
  windowMonths: number;
  periodStart: string;
  periodEnd: string;
  analyzedTransactions: number;
  generatedAt: string;
  monthlySpend: HistoricalMonthlySpend[];
  trend: HistoricalTrend;
  recurringProfiles: HistoricalRecurringProfile[];
  outliers: HistoricalOutlier[];
  categoryShifts: HistoricalCategoryShift[];
  coverage: HistoricalCoverage;
}
