import {
  Activity,
  BarChart3,
  CalendarRange,
  RefreshCw,
  Repeat2,
  ScanLine,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiErrorAlert } from '../ui/ApiErrorAlert';
import {
  fetchLatestHistoricalAnalysis,
  runHistoricalAnalysis,
} from '../../services/historicalAnalysisApi';
import {
  ApiRequestError,
  getApiErrorPresentation,
  type ApiErrorPresentation,
} from '../../services/apiClient';
import type { HistoricalAnalysis } from '../../types/historicalAnalysis';
import { formatCurrencyWithDecimals } from '../../utils/formatters';


function trendLabel(direction: HistoricalAnalysis['trend']['direction']) {
  if (direction === 'increasing') return 'Increasing';
  if (direction === 'decreasing') return 'Decreasing';
  if (direction === 'stable') return 'Stable';
  return 'Not enough data';
}

function scorePercent(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

export function HistoricalAnalysisPanel() {
  const [analysis, setAnalysis] = useState<HistoricalAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<ApiErrorPresentation | null>(null);

  const loadLatest = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setAnalysis(await fetchLatestHistoricalAnalysis());
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.code === 'historical_analysis_not_found') {
        setAnalysis(null);
      } else {
        setError(getApiErrorPresentation(loadError, 'Unable to load historical analysis'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLatest();
  }, []);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      setAnalysis(await runHistoricalAnalysis(12));
    } catch (runError) {
      setError(getApiErrorPresentation(runError, 'Unable to run historical analysis'));
    } finally {
      setIsRunning(false);
    }
  };

  const TrendIcon = analysis?.trend.direction === 'decreasing' ? TrendingDown : TrendingUp;

  return (
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
            <BarChart3 size={16} /> Historical analysis
          </div>
          <h2 className="mt-2 text-xl font-bold text-slate-950">Behavior over time</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Reproducible statistical analysis of your expense history: linear trend, recurrence scoring,
            past-only robust outliers and category shifts. Scores are deterministic indices, not probabilities.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={isRunning}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? <RefreshCw size={17} className="animate-spin" /> : <ScanLine size={17} />}
          {isRunning ? 'Analyzing history…' : 'Run 12-month analysis'}
        </button>
      </div>

      {error && (
        <ApiErrorAlert
          error={error}
          className="mt-5"
          onRetry={error.retryable ? () => void loadLatest() : undefined}
        />
      )}

      {isLoading ? (
        <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
          Loading the latest persisted historical snapshot…
        </div>
      ) : analysis === null ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
          <CalendarRange size={24} className="mx-auto text-slate-400" />
          <h3 className="mt-3 font-bold text-slate-900">No historical snapshot yet</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Run the analysis once you have transaction history. Sparse datasets are reported as insufficient data instead of generating artificial signals.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <TrendIcon size={17} /> Spending trend
              </div>
              <p className="mt-2 text-xl font-bold text-slate-950">{trendLabel(analysis.trend.direction)}</p>
              <p className="mt-1 text-xs text-slate-500">
                slope {formatCurrencyWithDecimals(analysis.trend.monthlySlope)}/month · R² {analysis.trend.rSquared}
              </p>
            </article>
            <article className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <CalendarRange size={17} /> Data coverage
              </div>
              <p className="mt-2 text-xl font-bold text-slate-950">{analysis.coverage.activeMonths}/{analysis.windowMonths} months</p>
              <p className="mt-1 text-xs text-slate-500">{analysis.analyzedTransactions} expense transactions</p>
            </article>
            <article className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <Repeat2 size={17} /> Recurring profiles
              </div>
              <p className="mt-2 text-xl font-bold text-slate-950">{analysis.recurringProfiles.length}</p>
              <p className="mt-1 text-xs text-slate-500">scored from cadence + amount stability</p>
            </article>
            <article className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <Activity size={17} /> Historical outliers
              </div>
              <p className="mt-2 text-xl font-bold text-slate-950">{analysis.outliers.length}</p>
              <p className="mt-1 text-xs text-slate-500">baseline uses only earlier transactions</p>
            </article>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-950">Recurring behavior scores</h3>
              <p className="mt-1 text-xs text-slate-500">Deterministic 0–100 pattern index; not a probability.</p>
              <div className="mt-4 space-y-4">
                {analysis.recurringProfiles.length === 0 ? (
                  <p className="text-sm text-slate-500">No merchant has enough stable cadence evidence yet.</p>
                ) : analysis.recurringProfiles.slice(0, 5).map((profile) => (
                  <div key={`${profile.merchant}-${profile.cadence}`}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <span className="font-semibold text-slate-800">{profile.merchant}</span>
                        <span className="ml-2 text-xs text-slate-400">{profile.cadence} · {profile.occurrenceCount} charges</span>
                      </div>
                      <span className="font-bold text-slate-900">{profile.patternScore}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-800"
                        style={{ width: `${scorePercent(profile.patternScore)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      median {formatCurrencyWithDecimals(profile.medianAmount)} · cadence fit {profile.cadenceFit} · amount stability {profile.amountStability}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-950">Historical outliers</h3>
              <p className="mt-1 text-xs text-slate-500">Each candidate is compared only with transactions that occurred before it.</p>
              <div className="mt-4 space-y-3">
                {analysis.outliers.length === 0 ? (
                  <p className="text-sm text-slate-500">No high positive outliers met the robust threshold.</p>
                ) : analysis.outliers.slice(0, 5).map((outlier) => (
                  <div key={outlier.transactionId} className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{outlier.merchant}</p>
                        <p className="text-xs text-slate-400">{outlier.date} · {outlier.baselineScope} baseline ({outlier.baselineCount})</p>
                      </div>
                      <p className="text-sm font-bold text-slate-950">{formatCurrencyWithDecimals(outlier.amount)}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      baseline {formatCurrencyWithDecimals(outlier.baselineMedian)} · robust deviation {outlier.deviationScore}× spread
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-950">Category shifts</h3>
            <p className="mt-1 text-xs text-slate-500">Average monthly spend in the latest 3 months versus the previous 3 months.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {analysis.categoryShifts.length === 0 ? (
                <p className="text-sm text-slate-500">No category changed by at least €10/month across the comparison windows.</p>
              ) : analysis.categoryShifts.map((shift) => (
                <article key={shift.category} className="rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{shift.category}</span>
                    <span className="text-xs font-semibold text-slate-500">{shift.direction}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {formatCurrencyWithDecimals(shift.previousThreeMonthAverage)} → {formatCurrencyWithDecimals(shift.currentThreeMonthAverage)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Δ {formatCurrencyWithDecimals(shift.delta)}{shift.percentChange !== null ? ` · ${shift.percentChange}%` : ''}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <p className="mt-5 text-xs text-slate-400">
            Snapshot {analysis.analysisVersion} · {analysis.periodStart} to {analysis.periodEnd} · generated {new Date(analysis.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </section>
  );
}
