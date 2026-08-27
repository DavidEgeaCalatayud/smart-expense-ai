export type ForecastBaselineId = 'three_month_mean' | 'run_rate' | 'recurrence_aware';

export interface ForecastBacktestMetrics {
  support: number;
  cutoffDay: number;
  mae: string | null;
  smapePercent: string | null;
  bias: string | null;
}

export interface SpendingForecastBaseline {
  baseline: ForecastBaselineId;
  label: string;
  available: boolean;
  projectedMonthEnd: string | null;
  differenceFromThreeMonthMean: string | null;
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
  spentSoFar: string;
  historicalThreeMonthMean: string | null;
  backtestCutoffDay: number;
  backtestMonths: number;
  baselines: SpendingForecastBaseline[];
}
