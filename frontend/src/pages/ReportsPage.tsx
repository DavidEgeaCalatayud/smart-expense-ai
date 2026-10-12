import { Download, FileSpreadsheet, LockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import {
  downloadMonthlyReport,
  fetchMonthlyReport,
  fetchReportEntitlements,
} from '../services/reportsApi';
import { getApiErrorMessage } from '../services/apiClient';
import type { MonthlyReport, ReportEntitlements } from '../types/reports';
import { formatCurrencyWithDecimals } from '../utils/formatters';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function ReportsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [entitlements, setEntitlements] = useState<ReportEntitlements | null>(null);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  const reportsFeature = entitlements?.features.exportableReports;
  const isEnabled = reportsFeature?.enabled === true;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      setEntitlements(null);
      setReport(null);
      setLoadError(null);
      setStatus(null);
      try {
        const nextEntitlements = await fetchReportEntitlements();
        if (!active) return;
        setEntitlements(nextEntitlements);
        if (nextEntitlements.features.exportableReports?.enabled && month) {
          const nextReport = await fetchMonthlyReport(month);
          if (!active) return;
          setReport(nextReport);
        }
      } catch (error) {
        if (!active) return;
        setReport(null);
        setLoadError(getApiErrorMessage(error, 'No se han podido cargar los informes.'));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [month]);

  const handleDownload = async () => {
    if (!month) return;
    setIsDownloading(true);
    setStatus(null);
    try {
      const { blob, filename } = await downloadMonthlyReport(month);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus(`Descargado ${filename}.`);
    } catch (error) {
      setStatus(getApiErrorMessage(error, 'No se ha podido descargar el informe.'));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Informes"
        title="Informes"
        description="Revisa el resumen mensual de tus finanzas y exporta los datos cuando lo necesites."
      />

      <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="block text-sm font-semibold text-slate-700">
            Reporting month
            <input
              type="month"
              required
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="mt-2 block rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          {isEnabled ? (
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={isLoading || !report || !month || isDownloading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={17} />
              {isDownloading ? 'Preparando CSV…' : 'Descargar CSV'}
            </button>
          ) : null}
        </div>
        {status ? <p className="mt-4 text-sm text-slate-600" role="status">{status}</p> : null}
      </section>

      {isLoading ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-soft">
          Preparando tu informe mensual…
        </section>
      ) : entitlements === null ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50/60 p-7 shadow-soft" role="alert">
          <h2 className="text-xl font-bold text-slate-950">No se ha podido comprobar el acceso a informes</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {loadError ?? 'No se ha podido comprobar la disponibilidad del informe. Inténtalo de nuevo cuando recuperes conexión.'}
          </p>
        </section>
      ) : !isEnabled ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-7 shadow-soft">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <LockKeyhole size={22} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-950">Exportación de informes Premium</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            La exportación de informes está disponible con Premium y no está incluida actualmente en tu cuenta.
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Plan actual: {entitlements.planTier}
          </p>
        </section>
      ) : report ? (
        <>
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Ingresos', formatCurrencyWithDecimals(report.totalIncome)],
              ['Gastos', formatCurrencyWithDecimals(report.totalExpenses)],
              ['Neto', formatCurrencyWithDecimals(report.net)],
              ['Movimientos', String(report.transactionCount)],
            ].map(([label, value]) => (
              <article key={label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
                <p className="mt-2 text-xs text-slate-400">{report.month} · {report.currency}</p>
              </article>
            ))}
          </section>

          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-950">Desglose por categorías</h2>
                <p className="text-sm text-slate-500">Totales del mes agrupados por categoría</p>
              </div>
            </div>

            {report.categoryBreakdown.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                No hay movimientos este mes. Puedes descargar igualmente el informe con el resumen mensual.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Categoría</th>
                      <th className="px-3 py-3 font-semibold">Tipo</th>
                      <th className="px-3 py-3 text-right font-semibold">Movimientos</th>
                      <th className="px-3 py-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.categoryBreakdown.map((item) => (
                      <tr key={`${item.type}-${item.category}`}>
                        <td className="px-3 py-4 font-semibold text-slate-800">{item.category}</td>
                        <td className="px-3 py-4 capitalize text-slate-500">{item.type}</td>
                        <td className="px-3 py-4 text-right text-slate-500">{item.transactionCount}</td>
                        <td className="px-3 py-4 text-right font-semibold text-slate-900">
                          {formatCurrencyWithDecimals(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="rounded-3xl border border-rose-200 bg-rose-50/60 p-7 shadow-soft" role="alert">
          <h2 className="text-xl font-bold text-slate-950">Informe no disponible</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {loadError ?? 'No se ha podido cargar el informe mensual.'}
          </p>
        </section>
      )}
    </>
  );
}
