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
  { value: 'open', label: 'Open' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

const money = (value: unknown) =>
  typeof value === 'string' ? formatCurrencyWithDecimals(value) : '—';

function evidenceText(finding: IntelligenceFinding): string {
  const evidence = finding.evidence;
  if (finding.type === 'recurring_pattern') {
    const calendar = evidence.streamCalendar ? ` · ${String(evidence.streamCalendar)}` : '';
    return `${String(evidence.cadence ?? 'Recurring')}${calendar} · ${String(evidence.occurrenceCount ?? '—')} occurrences · score ${String(evidence.patternScore ?? '—')}/100 · median ${money(evidence.medianAmount)} · next ${String(evidence.nextExpectedDate ?? '—')}`;
  }
  if (finding.type === 'recurring_payment_missing') {
    return `Expected ${String(evidence.nextExpectedDate ?? '—')} · ${String(evidence.overdueDays ?? '—')} days late · ${String(evidence.missedExpectedOccurrences ?? '—')} missed occurrence(s) · typical ${money(evidence.medianAmount)}`;
  }
  if (finding.type === 'duplicate_subscription') {
    const months = Array.isArray(evidence.duplicateMonths) ? evidence.duplicateMonths.join(', ') : '—';
    return `${String(evidence.pairCount ?? '—')} near-duplicate pairs · around ${money(evidence.approximateAmount)} · months ${months}`;
  }
  if (finding.type === 'frequency_anomaly') {
    return `${String(evidence.currentCount ?? '—')} charges in ${String(evidence.period ?? '—')} vs ${String(evidence.baselineMedianCount ?? '—')} typical · ${String(evidence.frequencyRatio ?? '—')}× frequency · max ${String(evidence.maxChargesIn7Days ?? '—')} in 7 days`;
  }
  return `${money(evidence.amount)} vs ${String(evidence.baselineScope ?? 'historical')} baseline ${money(evidence.baselineMedian)} · ${String(evidence.ratio ?? '—')}× typical · deviation ${String(evidence.deviationScore ?? '—')} · n=${String(evidence.baselineCount ?? '—')}`;
}

function typeMeta(finding: IntelligenceFinding) {
  if (finding.type === 'recurring_pattern') {
    return { icon: Repeat2, label: 'Recurring stream' };
  }
  if (finding.type === 'recurring_payment_missing') {
    return { icon: CalendarClock, label: 'Missing recurring payment' };
  }
  if (finding.type === 'duplicate_subscription') {
    return { icon: CopyCheck, label: 'Possible duplicate subscription' };
  }
  if (finding.type === 'frequency_anomaly') {
    return { icon: Gauge, label: 'Frequency anomaly' };
  }
  return { icon: Activity, label: 'Amount anomaly' };
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
      setError(getApiErrorPresentation(loadError, 'Unable to load financial intelligence'));
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
      setNotice(
        `Analysis completed: ${result.detectedFindings} findings from ${result.analyzedTransactions} expense transactions.`,
      );
      await loadIntelligence(true);
    } catch (scanError) {
      setError(getApiErrorPresentation(scanError, 'Unable to run financial analysis'));
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
      setNotice(status === 'open' ? 'Finding reopened.' : `Finding marked as ${status}.`);
      await loadIntelligence(true);
    } catch (updateError) {
      setError(getApiErrorPresentation(updateError, 'Unable to update finding'));
    } finally {
      setActiveFindingId(null);
    }
  };

  const lastScanLabel = summary.lastScanAt
    ? new Date(summary.lastScanAt).toLocaleString()
    : 'No analysis has been run yet';

  return (
    <>
      <PageHeader
        eyebrow="Explainable rules engine"
        title="Financial intelligence"
        description="Rules-v2 turns canonical merchants, recurring streams and chronological baselines into persisted findings without simulated AI confidence."
        action={
          <button
            type="button"
            onClick={() => void handleScan()}
            disabled={isScanning}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isScanning ? <RefreshCw size={18} className="animate-spin" /> : <ScanSearch size={18} />}
            {isScanning ? 'Analyzing…' : 'Run findings scan'}
          </button>
        }
      />

      {error && (
        <ApiErrorAlert
          error={error}
          className="mb-5"
          onRetry={() => void loadIntelligence(true)}
          retryLabel={isRefreshing ? 'Refreshing…' : 'Retry'}
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
          { label: 'Open findings', value: summary.openCount, icon: AlertTriangle },
          { label: 'Recurring streams', value: summary.recurringCount, icon: Repeat2 },
          { label: 'Missing recurring', value: summary.missingRecurringCount, icon: CalendarClock },
          { label: 'Possible duplicates', value: summary.duplicateSubscriptionCount, icon: CopyCheck },
          { label: 'Basic anomalies', value: summary.anomalyCount, icon: Activity },
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
            <h2 className="font-bold text-slate-950">Findings scan state</h2>
            <p className="mt-1 text-sm text-slate-500">
              Last scan: {lastScanLabel} · {summary.analyzedTransactions} expense transactions · {summary.ruleVersion}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Anomalies: {summary.amountAnomalyCount} amount · {summary.frequencyAnomalyCount} frequency
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Finding status filter">
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
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-soft">
            Loading persisted intelligence findings...
          </div>
        ) : findings.length === 0 ? (
          <EmptyStateCard
            icon={<ScanSearch size={22} />}
            title={summary.lastScanAt ? `No ${statusFilter === 'all' ? '' : `${statusFilter} `}findings` : 'Run your first financial analysis'}
            description={
              summary.lastScanAt
                ? 'The current deterministic rules do not have findings in this review state.'
                : 'The rules engine only creates findings after it has enough persisted transaction evidence; it never fabricates alerts.'
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
                          {finding.severity}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {finding.status}
                        </span>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">{finding.title}</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{finding.explanation}</p>
                      <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <span className="font-semibold text-slate-800">Evidence:</span> {evidenceText(finding)}
                      </div>
                      <p className="mt-3 text-xs text-slate-400">
                        Rule {finding.ruleVersion} · last detected {new Date(finding.lastDetectedAt).toLocaleString()}
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
                          <CheckCircle2 size={15} /> Resolve
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleStatus(finding.id, 'dismissed')}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"
                        >
                          <XCircle size={15} /> Dismiss
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleStatus(finding.id, 'open')}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"
                      >
                        <RotateCcw size={15} /> Reopen
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
