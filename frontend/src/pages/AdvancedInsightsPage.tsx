import { AlertTriangle, LockKeyhole, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { getApiErrorMessage } from '../services/apiClient';
import {
  fetchAdvancedInsightEntitlements,
  fetchAdvancedInsights,
} from '../services/advancedInsightsApi';
import type { ReportEntitlements } from '../types/reports';
import type {
  AdvancedInsightMetric,
  AdvancedInsightsResponse,
} from '../types/advancedInsights';
import { formatCurrencyWithDecimals } from '../utils/formatters';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMetric(metric: AdvancedInsightMetric): string {
  if (metric.format === 'currency') return formatCurrencyWithDecimals(metric.value);
  if (metric.format === 'percent') return `${metric.value}%`;
  return metric.value;
}

function priorityLabel(priority: string): string {
  if (priority === 'attention') return 'Needs attention';
  if (priority === 'positive') return 'Positive';
  return 'Informational';
}

export function AdvancedInsightsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [entitlements, setEntitlements] = useState<ReportEntitlements | null>(null);
  const [payload, setPayload] = useState<AdvancedInsightsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const feature = entitlements?.features.advancedInsights;
  const isEnabled = feature?.enabled === true;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      setEntitlements(null);
      setPayload(null);
      try {
        const nextEntitlements = await fetchAdvancedInsightEntitlements();
        if (!active) return;
        setEntitlements(nextEntitlements);
        if (nextEntitlements.features.advancedInsights?.enabled && month) {
          const nextPayload = await fetchAdvancedInsights(month);
          if (!active) return;
          setPayload(nextPayload);
        }
      } catch (error) {
        if (!active) return;
        setLoadError(getApiErrorMessage(error, 'Unable to load advanced insights.'));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [month]);

  return (
    <>
      <PageHeader
        eyebrow="Premium intelligence"
        title="Advanced Insights"
        description="Prioritized, explainable financial signals composed from exact server-side evidence already owned by your account."
      />

      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <label className="block max-w-xs text-sm font-semibold text-slate-700">
          Insight month
          <input
            type="month"
            required
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="mt-2 block w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </section>

      {isLoading ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-soft">
          Verifying Premium access and composing account evidence...
        </section>
      ) : loadError && entitlements === null ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50/60 p-7 shadow-soft" role="alert">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
            <AlertTriangle size={22} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-950">Unable to verify insight access</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{loadError}</p>
        </section>
      ) : !isEnabled ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-7 shadow-soft">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <LockKeyhole size={22} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-950">Premium advanced insights</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Advanced insights are released as a Premium feature. Your current account does not have this entitlement enabled. Billing checkout is not yet exposed in the product, so this screen does not simulate an upgrade or payment flow.
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Plan: {entitlements?.planTier ?? 'unknown'} · Policy: {entitlements?.policyVersion ?? 'unavailable'}
          </p>
        </section>
      ) : loadError ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50/60 p-7 shadow-soft" role="alert">
          <h2 className="text-xl font-bold text-slate-950">Advanced insights unavailable</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{loadError}</p>
        </section>
      ) : payload ? (
        <>
          <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <Sparkles size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Explainable monthly signal set</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {payload.insightVersion} · {payload.month} · {payload.currency}
                </p>
              </div>
            </div>
          </section>

          {payload.insights.length === 0 ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-soft">
              No advanced insight cards are available for this month yet.
            </section>
          ) : (
            <section className="grid gap-5 xl:grid-cols-2" aria-label="Advanced insight cards">
              {payload.insights.map((insight) => (
                <article key={insight.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {insight.kind.replace(/_/g, ' ')}
                      </p>
                      <h2 className="mt-1 text-xl font-bold text-slate-950">{insight.title}</h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {priorityLabel(insight.priority)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{insight.summary}</p>

                  <div className="mt-5 space-y-4">
                    {insight.evidence.map((evidence) => (
                      <div key={`${insight.id}-${evidence.source}-${evidence.reference}`} className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {evidence.source} · {evidence.reference}
                        </p>
                        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                          {evidence.metrics.map((metric) => (
                            <div key={metric.key}>
                              <dt className="text-xs text-slate-400">{metric.label}</dt>
                              <dd className="mt-1 text-sm font-semibold text-slate-900">
                                {formatMetric(metric)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          )}

          <section className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-sm font-bold text-slate-800">Interpretation boundaries</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-500">
              {payload.limitations.map((limitation) => (
                <li key={limitation}>• {limitation}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </>
  );
}
