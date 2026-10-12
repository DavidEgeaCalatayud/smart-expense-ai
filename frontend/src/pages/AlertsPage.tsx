import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CopyCheck,
  Gauge,
  RefreshCw,
  Repeat2,
  RotateCcw,
  ScanSearch,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { HistoricalAnalysisPanel } from '../components/intelligence/HistoricalAnalysisPanel';
import { PageHeader } from '../components/layout/PageHeader';
import { ApiErrorAlert } from '../components/ui/ApiErrorAlert';
import { EmptyStateCard } from '../components/ui/EmptyStateCard';
import { Skeleton } from '../components/ui/Skeleton';
import { getApiErrorPresentation, type ApiErrorPresentation } from '../services/apiClient';
import {
  fetchIntelligenceFindings,
  fetchIntelligenceSummary,
  runIntelligenceScan,
  updateIntelligenceFindingStatus,
} from '../services/intelligenceApi';
import type {
  FindingStatus,
  IntelligenceFinding,
  IntelligenceSummary,
} from '../types/intelligence';
import { formatCurrencyWithDecimals } from '../utils/formatters';

const emptySummary: IntelligenceSummary = {
  openCount: 0,
  recurringCount: 0,
  missingRecurringCount: 0,
  duplicateSubscriptionCount: 0,
  anomalyCount: 0,
  amountAnomalyCount: 0,
  frequencyAnomalyCount: 0,
  dismissedCount: 0,
  resolvedCount: 0,
  lastScanAt: null,
  analyzedTransactions: 0,
  ruleVersion: 'rules-v2',
};

type StatusFilter = FindingStatus | 'all';

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Pendientes' },
  { value: 'dismissed', label: 'Descartados' },
  { value: 'resolved', label: 'Resueltos' },
  { value: 'all', label: 'Todos' },
];

function findingStatusLabel(status: FindingStatus): string {
  if (status === 'open') return 'Pendiente';
  if (status === 'dismissed') return 'Descartado';
  return 'Resuelto';
}

function severityLabel(severity: IntelligenceFinding['severity']): string {
  if (severity === 'high') return 'Alta';
  if (severity === 'warning') return 'Aviso';
  return 'Informativa';
}

const money = (value: unknown) =>
  typeof value === 'string' ? formatCurrencyWithDecimals(value) : '—';

function evidenceText(finding: IntelligenceFinding): string {
  const evidence = finding.evidence;
  if (finding.type === 'recurring_pattern') {
    const calendar = evidence.streamCalendar ? ` · ${String(evidence.streamCalendar)}` : '';
    return `${String(evidence.cadence ?? 'Recurrente')}${calendar} · ${String(evidence.occurrenceCount ?? '—')} registros · patrón ${String(evidence.patternScore ?? '—')}/100 · importe habitual ${money(evidence.medianAmount)} · próximo ${String(evidence.nextExpectedDate ?? '—')}`;
  }
  if (finding.type === 'recurring_payment_missing') {
    return `Previsto ${String(evidence.nextExpectedDate ?? '—')} · ${String(evidence.overdueDays ?? '—')} días de retraso · ${String(evidence.missedExpectedOccurrences ?? '—')} cargo(s) esperado(s) no detectado(s) · importe habitual ${money(evidence.medianAmount)}`;
  }
  if (finding.type === 'duplicate_subscription') {
    const months = Array.isArray(evidence.duplicateMonths) ? evidence.duplicateMonths.join(', ') : '—';
    return `${String(evidence.pairCount ?? '—')} posibles duplicados · alrededor de ${money(evidence.approximateAmount)} · meses ${months}`;
  }
  if (finding.type === 'frequency_anomaly') {
    return `${String(evidence.currentCount ?? '—')} cargos en ${String(evidence.period ?? '—')} frente a ${String(evidence.baselineMedianCount ?? '—')} habituales · frecuencia ${String(evidence.frequencyRatio ?? '—')}× · máximo ${String(evidence.maxChargesIn7Days ?? '—')} en 7 días`;
  }
  return `${money(evidence.amount)} frente a un importe habitual de ${money(evidence.baselineMedian)} · ${String(evidence.ratio ?? '—')}× lo normal · desviación ${String(evidence.deviationScore ?? '—')}`;
}

function typeMeta(finding: IntelligenceFinding) {
  if (finding.type === 'recurring_pattern') {
    return { icon: Repeat2, label: 'Pago recurrente' };
  }
  if (finding.type === 'recurring_payment_missing') {
    return { icon: CalendarClock, label: 'Pago recurrente no detectado' };
  }
  if (finding.type === 'duplicate_subscription') {
    return { icon: CopyCheck, label: 'Posible suscripción duplicada' };
  }
  if (finding.type === 'frequency_anomaly') {
    return { icon: Gauge, label: 'Frecuencia inusual' };
  }
  return { icon: Activity, label: 'Importe inusual' };
}

function severityClasses(severity: IntelligenceFinding['severity']) {
  if (severity === 'high') return 'bg-rose-100 text-rose-700';
  if (severity === 'warning') return 'bg-amber-100 text-amber-700';
  return 'bg-sky-100 text-sky-700';
}

export function AlertsPage() {
  const [summary, setSummary] = useState<IntelligenceSummary>(emptySummary);
  const [findings, setFindings] = useState<IntelligenceFinding[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadIntelligence = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [loadedSummary, loadedFindings] = await Promise.all([
        fetchIntelligenceSummary(),
        fetchIntelligenceFindings(statusFilter === 'all' ? {} : { status: statusFilter }),
      ]);
      setSummary(loadedSummary);
      setFindings(loadedFindings);
    } catch (loadError) {
      setError(getApiErrorPresentation(loadError, 'No se ha podido cargar la inteligencia financiera'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadIntelligence();
  }, [loadIntelligence]);

  const handleScan = async () => {
    setIsScanning(true);
    setError(null);
    setNotice(null);
    try {
      const result = await runIntelligenceScan();
      setNotice(`Análisis completado: ${result.detectedFindings} aviso${result.detectedFindings === 1 ? '' : 's'} detectado${result.detectedFindings === 1 ? '' : 's'} en ${result.analyzedTransactions} movimientos.`);
      await loadIntelligence(true);
    } catch (scanError) {
      setError(getApiErrorPresentation(scanError, 'No se ha podido ejecutar el análisis financiero'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleStatus = async (findingId: string, status: FindingStatus) => {
    setActiveFindingId(findingId);
    setError(null);
    setNotice(null);
    try {
      await updateIntelligenceFindingStatus(findingId, status);
      setNotice(status === 'open' ? 'Aviso reabierto.' : status === 'resolved' ? 'Aviso marcado como resuelto.' : 'Aviso descartado.');
      await loadIntelligence(true);
    } catch (updateError) {
      setError(getApiErrorPresentation(updateError, 'No se ha podido actualizar el aviso'));
    } finally {
      setActiveFindingId(null);
    }
  };

  const lastScanLabel = summary.lastScanAt
    ? new Date(summary.lastScanAt).toLocaleString()
    : 'Todavía no se ha ejecutado ningún análisis';

  return (
    <>
      <PageHeader
        eyebrow="Inteligencia financiera"
        title="Inteligencia financiera"
        description="Detecta patrones recurrentes, posibles duplicados y gastos inusuales a partir de tu historial."
        action={
          <button
            type="button"
            onClick={() => void handleScan()}
            disabled={isScanning}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isScanning ? <RefreshCw size={18} className="animate-spin" /> : <ScanSearch size={18} />}
            {isScanning ? 'Analizando…' : 'Analizar movimientos'}
          </button>
        }
      />

      {error && (
        <ApiErrorAlert
          error={error}
          className="mb-5"
          onRetry={() => void loadIntelligence(true)}
          retryLabel={isRefreshing ? 'Actualizando…' : 'Reintentar'}
        />
      )}

      {notice && (
        <div role="status" className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Avisos pendientes', value: summary.openCount, icon: AlertTriangle },
          { label: 'Pagos recurrentes', value: summary.recurringCount, icon: Repeat2 },
          { label: 'Pagos esperados', value: summary.missingRecurringCount, icon: CalendarClock },
          { label: 'Posibles duplicados', value: summary.duplicateSubscriptionCount, icon: CopyCheck },
          { label: 'Gastos inusuales', value: summary.anomalyCount, icon: Activity },
        ].map((metric) => (
          <article key={metric.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <metric.icon size={19} />
            </div>
            <p className="text-sm font-medium text-slate-500">{metric.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{metric.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-bold text-slate-950">Estado del análisis</h2>
            <p className="mt-1 text-sm text-slate-500">
              Último análisis: {lastScanLabel} · {summary.analyzedTransactions} movimientos revisados
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Avisos por importe: {summary.amountAnomalyCount} · por frecuencia: {summary.frequencyAnomalyCount}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Filtro de estado de avisos">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  statusFilter === filter.value
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <HistoricalAnalysisPanel />

      <section className="mt-8 space-y-4">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Cargando avisos">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-4 h-6 w-2/3" />
                <Skeleton className="mt-3 h-4 w-full" />
              </div>
            ))}
          </div>
        ) : findings.length === 0 ? (
          <EmptyStateCard
            icon={<ScanSearch size={22} />}
            title={summary.lastScanAt ? 'No hay avisos en este estado' : 'Haz tu primer análisis financiero'}
            description={
              summary.lastScanAt
                ? 'No hay resultados que coincidan con el filtro seleccionado.'
                : 'Cuando haya suficiente historial, aquí aparecerán patrones y gastos que convenga revisar.'
            }
          />
        ) : (
          findings.map((finding) => {
            const meta = typeMeta(finding);
            const busy = activeFindingId === finding.id;
            return (
              <article key={finding.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                      <meta.icon size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{meta.label}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${severityClasses(finding.severity)}`}>
                          {severityLabel(finding.severity)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {findingStatusLabel(finding.status)}
                        </span>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{finding.title}</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{finding.explanation}</p>
                      <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <span className="font-semibold text-slate-800">Datos:</span> {evidenceText(finding)}
                      </div>
                      <p className="mt-3 text-xs text-slate-400">
                        Detectado por última vez {new Date(finding.lastDetectedAt).toLocaleString('es-ES')}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                    {finding.status === 'open' ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStatus(finding.id, 'resolved')}
                          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 size={15} /> Resolver
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStatus(finding.id, 'dismissed')}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"
                        >
                          <XCircle size={15} /> Descartar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleStatus(finding.id, 'open')}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"
                      >
                        <RotateCcw size={15} /> Reabrir
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </>
  );
}
