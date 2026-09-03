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
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  const reportsFeature = entitlements?.features.exportableReports;
  const isEnabled = reportsFeature?.enabled === true;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoading(true);
      setStatus(null);
      try {
        const nextEntitlements = await fetchReportEntitlements();
        if (!active) return;
        setEntitlements(nextEntitlements);
        if (nextEntitlements.features.exportableReports?.enabled && month) {
          const nextReport = await fetchMonthlyReport(month);
          if (!active) return;
          setReport(nextReport);
        } else {
          setReport(null);
        }
      } catch (error) {
        if (!active) return;
        setReport(null);
        setStatus(getApiErrorMessage(error, 'Unable to load reports.'));
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
      setStatus(`Downloaded ${filename}.`);
    } catch (error) {
      setStatus(getApiErrorMessage(error, 'Unable to download the report.'));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Premium reporting"
        title="Reports"
        description="Review a server-calculated monthly financial summary and export the same account-isolated data as a spreadsheet-safe CSV."
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
              {isDownloading ? 'Preparing CSV...' : 'Download CSV'}
            </button>
          ) : null}
        </div>
        {status ? <p className="mt-4 text-sm text-slate-600" role="status">{status}</p> : null}
      </section>

      {isLoading ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-soft">
          Loading report access and monthly totals...
        </section>
      ) : !isEnabled ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-7 shadow-soft">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <LockKeyhole size={22} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-950">Premium report export</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Exportable reports are released as a Premium feature. Your current account does not have this entitlement enabled. Billing checkout is not yet exposed in the product, so this screen does not simulate an upgrade or payment flow.
          </p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Plan: {entitlements?.planTier ?? 'unknown'} · Policy: {entitlements?.policyVersion ?? 'unavailable'}
          </p>
        </section>
      ) : report ? (
        <>
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Income', formatCurrencyWithDecimals(report.totalIncome)],
              ['Expenses', formatCurrencyWithDecimals(report.totalExpenses)],
              ['Net', formatCurrencyWithDecimals(report.net)],
              ['Transactions', String(report.transactionCount)],
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
                <h2 className="text-lg font-bold text-slate-950">Category breakdown</h2>
                <p className="text-sm text-slate-500">Exact totals calculated by FastAPI/PostgreSQL</p>
              </div>
            </div>

            {report.categoryBreakdown.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                No transactions exist for this month. You can still download an empty report with the monthly summary headers.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Category</th>
                      <th className="px-3 py-3 font-semibold">Type</th>
                      <th className="px-3 py-3 text-right font-semibold">Transactions</th>
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
      ) : null}
    </>
  );
}
