export type MoneyAmount = string;

export interface TransactionSummaryV2 {
  totalIncome: MoneyAmount;
  totalExpenses: MoneyAmount;
  balance: MoneyAmount;
  recurringCount: number;
  reviewCount: number;
  transactionCount: number;
}

export interface MonthlyExpensePointV2 {
  month: string;
  amount: MoneyAmount;
}

export type FindingType =
  | 'recurring_pattern'
  | 'recurring_payment_missing'
  | 'duplicate_subscription'
  | 'spending_anomaly'
  | 'frequency_anomaly';
export type FindingSeverity = 'info' | 'warning' | 'high';
export type FindingStatus = 'open' | 'dismissed' | 'resolved';

export interface IntelligenceFindingResponse {
  id: string;
  type: FindingType;
  severity: FindingSeverity;
  status: FindingStatus;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>;
  ruleVersion: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt: string | null;
}

export interface IntelligenceSummaryResponse {
  openCount: number;
  recurringCount: number;
  missingRecurringCount: number;
  duplicateSubscriptionCount: number;
  anomalyCount: number;
  amountAnomalyCount: number;
  frequencyAnomalyCount: number;
  dismissedCount: number;
  resolvedCount: number;
  lastScanAt: string | null;
  analyzedTransactions: number;
  ruleVersion: string;
}

export interface IntelligenceScanResponse {
  scanId: string;
  ruleVersion: string;
  analyzedTransactions: number;
  detectedFindings: number;
  scannedAt: string;
}

export type HistoricalTrendDirection =
  | 'increasing'
  | 'decreasing'
  | 'stable'
  | 'insufficient_data';

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

export interface HistoricalRecurringProfileV22 {
  streamKey: string | null;
  streamDescriptor: string | null;
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
  streamBasis: string;
  streamCalendar: string | null;
  sourceStreamCount: number;
  canonicalVariantCount: number;
  priceRegimeCount: number;
  lifecycleReactivated: boolean;
  lifecycleEpisodeCount: number;
  priorEpisodeOccurrenceCount: number;
}

export interface HistoricalOutlierV22 {
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
  baselinePolicy: string;
  baselineMad: MoneyAmount;
  firstQuartile: MoneyAmount;
  thirdQuartile: MoneyAmount;
  interquartileRange: MoneyAmount;
  distributionUpperFence: MoneyAmount;
  ratio: string;
  threshold: MoneyAmount;
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

export interface HistoricalCoverageV22 {
  transactionCount: number;
  activeMonths: number;
  completeMonths: number;
  partialMonthsExcluded: number;
  canonicalMerchants: number;
  merchantsWithBaseline: number;
  categoriesWithBaseline: number;
  recurringProfiles: number;
  recurringStreams: number;
  temporalPhaseStreams: number;
  priceContinuityStreams: number;
  lifecycleReactivationStreams: number;
  outlierCount: number;
}

export interface HistoricalRecurrenceSegmentationV22 {
  strategy: string;
  analysisVersion: string;
  profileCount: number;
  strategyVersion: string;
  temporalPhaseProfileCount: number;
  priceContinuityProfileCount: number;
  lifecycleReactivationProfileCount: number;
  ambiguityPolicy: string;
  cadencePolicy: string;
  minimumParentShortCadenceFit: string;
  minimumParentWeekdayStability: string;
  amountOnlyPolicy: string;
  minimumAmountOnlyConsecutivePeriods: number;
  minimumAmountOnlyCalendarStability: string;
  minimumAmountOnlyEarlyConsecutivePeriods: number;
  minimumAmountOnlyEarlyCalendarStability: string;
  priceContinuityPolicy: string;
  minimumQualifiedMerchantRootTokens: number;
  minimumPriceContinuityOccurrences: number;
  minimumPriceContinuityCadenceFit: string;
  minimumPriceContinuityCalendarStability: string;
  maximumPriceContinuityRegimes: number;
  maximumPriceContinuityChangeRatio: string;
  maximumPriceContinuityPeriodGapMultiplier: number;
  priceContinuityRequiresCurrentSchedule: boolean;
  lifecyclePolicy: string;
  minimumLifecyclePriorOccurrences: number;
  minimumLifecycleReactivationOccurrences: number;
  maximumLifecycleCalendarDeviationDays: number;
  recurringScoreThreshold: string;
}

export interface HistoricalAnalysisResponseV22 {
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
  recurringProfiles: HistoricalRecurringProfileV22[];
  recurrenceSegmentation: HistoricalRecurrenceSegmentationV22;
  outliers: HistoricalOutlierV22[];
  categoryShifts: HistoricalCategoryShift[];
  coverage: HistoricalCoverageV22;
}

export type UpcomingPaymentStatus = 'expected' | 'likely' | 'price_changed' | 'overdue';

export interface UpcomingPaymentItem {
  streamKey: string;
  merchant: string;
  canonicalMerchant: string;
  expectedDate: string;
  expectedAmount: MoneyAmount;
  status: UpcomingPaymentStatus;
  cadence: string;
  patternScore: string;
  amountStability: string;
  historyDepth: string;
  occurrenceCount: number;
  missedExpectedOccurrences: number;
  streamBasis: string;
  priceRegimeCount: number;
  lifecycleReactivated: boolean;
  explanation: string;
}

export interface UpcomingPaymentsResponse {
  projectionVersion: string;
  analysisVersion: string;
  asOf: string;
  windowStart: string;
  windowEnd: string;
  days: number;
  expectedTotal: MoneyAmount;
  upcomingCount: number;
  overdueCount: number;
  upcomingPayments: UpcomingPaymentItem[];
  overduePayments: UpcomingPaymentItem[];
}

export type ForecastBaselineId = 'three_month_mean' | 'run_rate' | 'recurrence_aware';

export interface ForecastBacktestMetrics {
  support: number;
  cutoffDay: number;
  mae: MoneyAmount | null;
  smapePercent: string | null;
  bias: MoneyAmount | null;
}

export interface SpendingForecastBaseline {
  baseline: ForecastBaselineId;
  label: string;
  available: boolean;
  projectedMonthEnd: MoneyAmount | null;
  differenceFromThreeMonthMean: MoneyAmount | null;
  assumptions: string[];
  evidence: Record<string, string | number>;
  backtest: ForecastBacktestMetrics;
}

export interface SpendingForecastResponse {
  forecastVersion: string;
  asOf: string;
  month: string;
  daysInMonth: number;
  elapsedDays: number;
  remainingDays: number;
  spentSoFar: MoneyAmount;
  historicalThreeMonthMean: MoneyAmount | null;
  backtestCutoffDay: number;
  backtestMonths: number;
  baselines: SpendingForecastBaseline[];
}

export interface CategorySuggestionPreviewRequest {
  merchant: string;
  type: 'expense' | 'income';
}

export interface CategorySuggestionPreviewResponse {
  categoryId: string;
  categoryName: string;
  source: 'user_history' | 'global_model';
  modelVersion: string;
  featurePolicy: string;
}

export type FinancialAssistantEvidenceSource =
  | 'financial_summary'
  | 'period_comparison'
  | 'budget'
  | 'financial_findings'
  | 'historical_analysis'
  | 'transaction_search';

export interface FinancialAssistantEvidence {
  source: FinancialAssistantEvidenceSource;
  reference: string;
  label: string;
}

export interface FinancialAssistantQuery {
  question: string;
}

export interface FinancialAssistantAnswer {
  answer: string;
  evidence: FinancialAssistantEvidence[];
  limitations: string[];
  requestId: string;
}
