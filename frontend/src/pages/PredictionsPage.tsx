import {
  AlertTriangle,
  CalendarClock,
  CircleDollarSign,
  RefreshCw,
  Repeat,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyStateCard } from '../components/ui/EmptyStateCard';
import { fetchSpendingForecast } from '../services/spendingForecastApi';
import { fetchUpcomingPayments } from '../services/upcomingPaymentsApi';
import type { SpendingForecastBaseline, SpendingForecastResponse } from '../types/spendingForecast';
import type { UpcomingPaymentItem, UpcomingPaymentsResponse } from '../types/upcomingPayments';
import { formatCurrencyWithDecimals } from '../utils/formatters';

const statusLabel: Record<UpcomingPaymentItem['status'], string> = {
  expected: 'Expected',
  likely: 'Likely',
  price_changed: 'Price changed',
  overdue: 'Overdue',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}-01T00:00:00`));
}

function PaymentCard({ item }: { item: UpcomingPaymentItem }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-950">{item.merchant}</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {statusLabel[item.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(item.expectedDate)} · {item.cadence}
          </p>
        </div>
        <p className="text-lg font-bold text-slate-950">{formatCurrencyWithDecimals(item.expectedAmount)}</p>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-500">{item.explanation}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
        <span className="rounded-full bg-slate-50 px-3 py-1.5">Score {item.patternScore}</span>
        <span className="rounded-full bg-slate-50 px-3 py-1.5">{item.occurrenceCount} occurrences</span>
        {item.lifecycleReactivated ? (
          <span className="rounded-full bg-slate-50 px-3 py-1.5">Reactivated lifecycle</span>
        ) : null}
      </div>
    </article>
  );
}

function ForecastCard({ baseline }: { baseline: SpendingForecastBaseline }) {
  const backtest = baseline.backtest;
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{baseline.baseline}</p>
          <h3 className="mt-1 font-bold text-slate-950">{baseline.label}</h3>
        </div>
        <TrendingUp size={20} className="text-brand-700" />
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight text-slate-950">
        {baseline.projectedMonthEnd ? formatCurrencyWithDecimals(baseline.projectedMonthEnd) : 'Insufficient history'}
      </p>
      {baseline.differenceFromThreeMonthMean ? (
        <p className="mt-1 text-xs text-slate-500">
          {Number(baseline.differenceFromThreeMonthMean) >= 0 ? '+' : ''}
          {formatCurrencyWithDecimals(baseline.differenceFromThreeMonthMean)} vs 3-month mean
        </p>
      ) : null}
      <ul className="mt-4 space-y-1 text-xs leading-5 text-slate-500">
        {baseline.assumptions.slice(0, 2).map((assumption) => (
          <li key={assumption}>• {assumption}</li>
        ))}
      </ul>
      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-xs">
        <div>
          <p className="font-semibold text-slate-950">{backtest.mae ? formatCurrencyWithDecimals(backtest.mae) : '—'}</p>
          <p className="text-slate-500">MAE</p>
        </div>
        <div>
          <p className="font-semibold text-slate-950">{backtest.smapePercent ? `${backtest.smapePercent}%` : '—'}</p>
          <p className="text-slate-500">sMAPE</p>
        </div>
        <div>
          <p className="font-semibold text-slate-950">{backtest.bias ? formatCurrencyWithDecimals(backtest.bias) : '—'}</p>
          <p className="text-slate-500">Bias</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        {backtest.support} walk-forward month{backtest.support === 1 ? '' : 's'} · day {backtest.cutoffDay} cutoff
      </p>
    </article>
  );
}

export function PredictionsPage() {
  const [report, setReport] = useState<UpcomingPaymentsResponse | null>(null);
  const [forecast, setForecast] = useState<SpendingForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [payments, spendingForecast] = await Promise.all([
        fetchUpcomingPayments(30),
        fetchSpendingForecast(),
      ]);
      setReport(payments);
      setForecast(spendingForecast);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load predictions.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const result = new Map<string, UpcomingPaymentItem[]>();
    for (const item of report?.upcomingPayments ?? []) {
      const month = item.expectedDate.slice(0, 7);
      result.set(month, [...(result.get(month) ?? []), item]);
    }
    return [...result.entries()];
  }, [report]);

  return (
    <>
      <PageHeader
        eyebrow="Deterministic projection"
        title="Predictions"
        description="Month-end spending baselines and recurring payments use only evidence available at the forecast date. Backtest error is shown alongside each estimate; no probability or calibrated confidence is implied."
        action={(
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      />

      {error ? (
        <div role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="mb-10" aria-label="Month-end spending forecast">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">spending-forecast-v1</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Estimated month-end spending</h2>
            <p className="mt-1 text-sm text-slate-500">
              {forecast
                ? `${formatCurrencyWithDecimals(forecast.spentSoFar)} spent through ${formatDate(forecast.asOf)} · ${forecast.remainingDays} days remaining`
                : 'Loading causal forecasting baselines…'}
            </p>
          </div>
          {forecast?.historicalThreeMonthMean ? (
            <p className="text-sm text-slate-500">
              Previous 3-month mean: <strong className="text-slate-900">{formatCurrencyWithDecimals(forecast.historicalThreeMonthMean)}</strong>
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {forecast?.baselines.map((baseline) => (
            <ForecastCard key={baseline.baseline} baseline={baseline} />
          ))}
        </div>
        {forecast ? (
          <p className="mt-3 text-xs text-slate-500">
            Backtest uses the same day-{forecast.backtestCutoffDay} chronological folds for all baselines ({forecast.backtestMonths} comparable complete months). Lower MAE/sMAPE is better; signed bias reveals systematic over/under-estimation.
          </p>
        ) : null}
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <CircleDollarSign className="mb-4 text-brand-700" size={22} />
          <p className="text-sm font-medium text-slate-500">Expected next 30 days</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {report ? formatCurrencyWithDecimals(report.expectedTotal) : '—'}
          </p>
          <p className="mt-2 text-xs text-slate-500">Future charges only; overdue items are excluded.</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <CalendarClock className="mb-4 text-brand-700" size={22} />
          <p className="text-sm font-medium text-slate-500">Upcoming charges</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{report?.upcomingCount ?? '—'}</p>
          <p className="mt-2 text-xs text-slate-500">Window {report ? `${report.windowStart} → ${report.windowEnd}` : 'loading…'}</p>
        </article>
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <AlertTriangle className="mb-4 text-amber-600" size={22} />
          <p className="text-sm font-medium text-slate-500">Overdue schedules</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{report?.overdueCount ?? '—'}</p>
          <p className="mt-2 text-xs text-slate-500">Shown separately until new activity confirms the stream.</p>
        </article>
      </section>

      <section className="mt-8 space-y-8" aria-label="Upcoming recurring payment calendar">
        {isLoading && !report ? (
          <p className="text-sm font-medium text-slate-500">Building recurring calendar…</p>
        ) : null}
        {!isLoading && report && report.upcomingPayments.length === 0 ? (
          <EmptyStateCard
            icon={<Repeat size={22} />}
            title="No recurring charges expected in this window"
            description="Only active schedules with deterministic recurrence evidence are projected. Missing or dormant schedules are not rolled forward automatically."
          />
        ) : null}
        {grouped.map(([month, items]) => (
          <div key={month}>
            <h2 className="mb-4 text-lg font-bold capitalize text-slate-950">{monthLabel(month)}</h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {items.map((item) => (
                <PaymentCard key={`${item.streamKey}-${item.expectedDate}`} item={item} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {report && report.overduePayments.length > 0 ? (
        <section className="mt-10" aria-label="Overdue recurring payments">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Needs attention</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Overdue recurring schedules</h2>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {report.overduePayments.map((item) => (
              <PaymentCard key={`${item.streamKey}-${item.expectedDate}`} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
