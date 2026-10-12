import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarRange,
  RefreshCw,
  Repeat2,
  ScanLine,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ApiErrorAlert } from '../ui/ApiErrorAlert';
import { Skeleton } from '../ui/Skeleton';
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
  if (direction === 'increasing') return 'En aumento';
  if (direction === 'decreasing') return 'En descenso';
  if (direction === 'stable') return 'Estable';
  return 'Datos insuficientes';
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

  const loadLatest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setAnalysis(await fetchLatestHistoricalAnalysis());
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.code === 'historical_analysis_not_found') {
        setAnalysis(null);
      } else {
        setError(getApiErrorPresentation(loadError, 'No se ha podido cargar el análisis histórico'));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      setAnalysis(await runHistoricalAnalysis(12));
    } catch (runError) {
      setError(getApiErrorPresentation(runError, 'No se ha podido ejecutar el análisis histórico'));
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
          <h2 className="mt-2 text-xl font-bold text-slate-950">Evolución en el tiempo</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Observa cómo evolucionan tus gastos, qué pagos se repiten y qué cambios destacan a lo largo del tiempo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={isRunning}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? <RefreshCw size={17} className="animate-spin" /> : <ScanLine size={17} />}
          {isRunning ? 'Analizando historial…' : 'Analizar últimos 12 meses'}
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
        <div className="mt-6 grid gap-3 sm:grid-cols-2" role="status" aria-label="Cargando análisis histórico">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="rounded-2xl bg-slate-50 p-4">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="mt-3 h-7 w-3/5" />
              <Skeleton className="mt-2 h-3 w-4/5" />
            </div>
          ))}
        </div>
      ) : analysis === null ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
          <CalendarRange size={24} className="mx-auto text-slate-400" />
          <h3 className="mt-3 font-bold text-slate-900">Todavía no hay análisis histórico</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Ejecuta el análisis cuando tengas suficiente historial para descubrir tendencias y cambios relevantes.
          </p>
        </div>
      ) : (
        <>
          {analysis.monthCompleteness.partialMonth && (
            <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">El mes actual aún está incompleto</p>
                <p className="mt-1 text-xs leading-5 text-amber-700">
                  {analysis.monthCompleteness.partialMonth} se muestra en el historial, pero no se usa para comparar tendencias hasta que termine el mes.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <TrendIcon size={17} /> Spending trend
              </div>
              <p className="mt-2 text-xl font-bold text-slate-950">{trendLabel(analysis.trend.direction)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {analysis.trend.completeMonthsUsed} meses completos analizados
              </p>
            </article>
            <article className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <CalendarRange size={17} /> Data coverage
              </div>
              <p className="mt-2 text-xl font-bold text-slate-950">{analysis.coverage.completeMonths}/{analysis.windowMonths} meses</p>
              <p className="mt-1 text-xs text-slate-500">{analysis.analyzedTransactions} gastos · {analysis.coverage.canonicalMerchants} comercios</p>
            </article>
            <article className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <Repeat2 size={17} /> Recurring streams
              </div>
              <p className="mt-2 text-xl font-bold text-slate-950">{analysis.coverage.recurringStreams}</p>
              <p className="mt-1 text-xs text-slate-500">Patrones de pagos que se repiten con regularidad</p>
            </article>
            <article className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <Activity size={17} /> Historical outliers
              </div>
              <p className="mt-2 text-xl font-bold text-slate-950">{analysis.outliers.length}</p>
              <p className="mt-1 text-xs text-slate-500">Comparados con tu actividad anterior</p>
            </article>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-950">Patrones recurrentes</h3>
              <p className="mt-1 text-xs text-slate-500">Cuanto más estable es un patrón, más fácil resulta anticipar su próximo cargo.</p>
              <div className="mt-4 space-y-4">
                {analysis.recurringProfiles.length === 0 ? (
                  <p className="text-sm text-slate-500">Todavía no hay pagos con un patrón suficientemente estable.</p>
                ) : analysis.recurringProfiles.slice(0, 6).map((profile) => (
                  <div key={profile.streamKey ?? `${profile.canonicalMerchant ?? profile.merchant}-${profile.cadence}-${profile.medianAmount}`}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <span className="font-semibold text-slate-800">{profile.canonicalMerchant ?? profile.merchant}</span>
                        {profile.streamDescriptor && (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{profile.streamDescriptor}</span>
                        )}
                        <span className="ml-2 text-xs text-slate-400">{profile.cadence} · {profile.occurrenceCount} cargos</span>
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
                      importe habitual {formatCurrencyWithDecimals(profile.medianAmount)} · regularidad {profile.cadenceFit} · intervalo {profile.intervalRegularity} · calendario {profile.cadence === 'weekly' || profile.cadence === 'biweekly' ? profile.dayOfWeekStability : profile.dayOfMonthStability} · variación {profile.amountCv}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {profile.consecutivePeriods} registros consecutivos · {profile.missedExpectedOccurrences} pagos esperados no detectados · próximo {profile.nextExpectedDate}
                    </p>
                    {profile.observedMerchants.length > 1 && (
                      <p className="mt-1 text-xs text-slate-400">Descripciones observadas: {profile.observedMerchants.join(' · ')}</p>
                    )}
                    {profile.isExpectedPaymentMissing && (
                      <p className="mt-2 text-xs font-semibold text-amber-700">Este pago parece retrasado respecto a su patrón habitual.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-950">Gastos inusuales</h3>
              <p className="mt-1 text-xs text-slate-500">Se comparan con el comportamiento registrado anteriormente.</p>
              <div className="mt-4 space-y-3">
                {analysis.outliers.length === 0 ? (
                  <p className="text-sm text-slate-500">No se han detectado gastos especialmente inusuales.</p>
                ) : analysis.outliers.slice(0, 5).map((outlier) => (
                  <div key={outlier.transactionId} className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{outlier.merchant}</p>
                        <p className="text-xs text-slate-400">{outlier.canonicalMerchant && outlier.canonicalMerchant !== outlier.merchant.toLowerCase() ? `${outlier.canonicalMerchant} · ` : ''}{outlier.date} · {outlier.baselineScope} referencia ({outlier.baselineCount})</p>
                      </div>
                      <p className="text-sm font-bold text-slate-950">{formatCurrencyWithDecimals(outlier.amount)}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      importe habitual {formatCurrencyWithDecimals(outlier.baselineMedian)} · desviación {outlier.deviationScore}×
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-950">Cambios por categoría</h3>
            <p className="mt-1 text-xs text-slate-500">Compara los últimos tres meses completos con los tres anteriores.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {analysis.categoryShifts.length === 0 ? (
                <p className="text-sm text-slate-500">No hay cambios relevantes por categoría en los últimos seis meses.</p>
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
                  {shift.comparisonMonths.length === 6 && (
                    <p className="mt-1 text-xs text-slate-400">{shift.comparisonMonths[0]}–{shift.comparisonMonths[5]}</p>
                  )}
                </article>
              ))}
            </div>
          </div>

          <p className="mt-5 text-xs text-slate-400">
            Periodo analizado: {analysis.periodStart} – {analysis.periodEnd} · actualizado {new Date(analysis.generatedAt).toLocaleString('es-ES')}
          </p>
        </>
      )}
    </section>
  );
}
