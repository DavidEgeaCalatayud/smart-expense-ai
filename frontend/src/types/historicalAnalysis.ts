import type { MoneyAmount } from './transactions';

export type HistoricalTrendDirection = 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';

export interface HistoricalMonthlySpend {
  month: string;
  amount: MoneyAmount;
  isComplete: boolean;
  daysObserved: number | null;
  daysInMonth: number | null;
}

export interface HistoricalMonthCompleteness {
  strategy: string;
  partialMonth: string | null;
  completeMonthsUsed: number;
  reason: string;
}

export interface HistoricalTrend {
  direction: HistoricalTrendDirection;
  monthlySlope: MoneyAmount;
  averageMonthlySpend: MoneyAmount;
  rSquared: string;
  activeMonths: number;
  completeMonthsUsed: number;
  excludedPartialMonth: string | null;
}

export interface HistoricalRecurringProfile {
  merchant: string;
  canonicalMerchant: string | null;
  observedMerchants: string[];
  cadence: string;
  occurrenceCount: number;
  medianAmount: MoneyAmount;
  medianIntervalDays: string;
  intervalRegularity: string;
  dayOfMonthStability: string;
  monthEndFit: string;
  dayOfWeekStability: string;
  amountStability: string;
  amountMad: MoneyAmount;
  amountCv: string;
  cadenceFit: string;
  historyDepth: string;
  consecutivePeriods: number;
  missedExpectedOccurrences: number;
  isExpectedPaymentMissing: boolean;
  patternScore: string;
  nextExpectedDate: string;
}

export interface HistoricalOutlier {
  transactionId: string;
  merchant: string;
  canonicalMerchant: string | null;
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
  comparisonMonths: string[];
}

export interface HistoricalCoverage {
  transactionCount: number;
  activeMonths: number;
  completeMonths: number;
  partialMonthsExcluded: number;
  canonicalMerchants: number;
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
  monthCompleteness: HistoricalMonthCompleteness;
  trend: HistoricalTrend;
  recurringProfiles: HistoricalRecurringProfile[];
  outliers: HistoricalOutlier[];
  categoryShifts: HistoricalCategoryShift[];
  coverage: HistoricalCoverage;
}
