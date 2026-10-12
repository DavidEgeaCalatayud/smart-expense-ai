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
  if (priority === 'attention') return 'Necesita atención';
  if (priority === 'positive') return 'Positivo';
  return 'Informativo';
}

const insightKindLabels: Record<string, string> = {
  budget_pressure: 'Presupuestos',
  open_findings: 'Avisos pendientes',
  cash_flow: 'Flujo de caja',
  expense_change: 'Cambio de gasto',
  category_concentration: 'Concentración por categoría',
  net_worth_liquidity: 'Liquidez',
  investment_share: 'Inversión',
  emergency_coverage: 'Fondo de emergencia',
  net_worth_growth: 'Evolución del patrimonio',
  opportunity_capital: 'Capital disponible',
  account_concentration: 'Concentración por cuenta',
};

const metricLabels: Record<string, string> = {
  overBudgetCount: 'Presupuestos superados',
  highestPercentUsed: 'Mayor utilización',
  totalIncome: 'Ingresos',
  totalExpenses: 'Gastos',
  net: 'Neto',
  openFindingCount: 'Avisos pendientes',
};

function metricLabel(metric: AdvancedInsightMetric): string {
  return metricLabels[metric.key] ?? metric.label;
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
        setLoadError(getApiErrorMessage(error, 'No se han podido cargar los análisis avanzados.'));
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
        eyebrow="Análisis Premium"
        title="Análisis avanzados"
        description="Señales financieras priorizadas para ayudarte a detectar cambios, oportunidades y aspectos que conviene revisar."
      />

      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <label className="block max-w-xs text-sm font-semibold text-slate-700">
          Mes del análisis
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
          Preparando tus análisis…
        </section>
      ) : loadError && entitlements === null ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50/60 p-7 shadow-soft" role="alert">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
            <AlertTriangle size={22} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-950">No se ha podido comprobar el acceso a análisis</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{loadError}</p>
        </section>
      ) : !isEnabled ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-7 shadow-soft">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <LockKeyhole size={22} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-950">Análisis avanzados Premium</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Los análisis avanzados están disponibles con Premium y no están incluidos actualmente en tu cuenta.
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Plan actual: {entitlements?.planTier ?? 'desconocido'}
          </p>
        </section>
      ) : loadError ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50/60 p-7 shadow-soft" role="alert">
          <h2 className="text-xl font-bold text-slate-950">Análisis avanzados no disponibles</h2>
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
                <h2 className="text-lg font-bold text-slate-950">Resumen de señales del mes</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {payload.month} · {payload.currency}
                </p>
              </div>
            </div>
          </section>

          {payload.insights.length === 0 ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-soft">
              Todavía no hay análisis avanzados disponibles para este mes.
            </section>
          ) : (
            <section className="grid gap-5 xl:grid-cols-2" aria-label="Tarjetas de análisis avanzados">
              {payload.insights.map((insight) => (
                <article key={insight.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {insightKindLabels[insight.kind] ?? 'Análisis financiero'}
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
                          Datos de soporte
                        </p>
                        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                          {evidence.metrics.map((metric) => (
                            <div key={metric.key}>
                              <dt className="text-xs text-slate-400">{metricLabel(metric)}</dt>
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
            <h2 className="text-sm font-bold text-slate-800">Cómo interpretar estos resultados</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Estos análisis se basan en los datos disponibles de tu cuenta y deben interpretarse como ayuda para revisar tus finanzas, no como una garantía sobre gastos futuros.
            </p>
          </section>
        </>
      ) : null}
    </>
  );
}
