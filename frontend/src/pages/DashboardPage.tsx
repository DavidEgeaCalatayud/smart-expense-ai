import { PiggyBank, Plus, ReceiptText, Repeat, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MetricCard } from '../components/dashboard/MetricCard';
import { RecentTransactionsTable } from '../components/dashboard/RecentTransactionsTable';
import { SpendingChart } from '../components/dashboard/SpendingChart';
import { PageHeader } from '../components/layout/PageHeader';
import { ROUTES } from '../routes/paths';
import { getApiErrorMessage } from '../services/apiClient';
import { fetchMonthlyExpenses, fetchTransactionSummary } from '../services/analyticsApi';
import { fetchTransactions } from '../services/transactionsApi';
import type { MonthlyExpense } from '../types/dashboard';
import type { DetailedTransaction, TransactionSummary } from '../types/transactions';
import { formatCurrencyWithDecimals } from '../utils/formatters';

const emptySummary: TransactionSummary = {
  totalIncome: 0,
  totalExpenses: 0,
  balance: 0,
  recurringCount: 0,
  reviewCount: 0,
  transactionCount: 0,
};

const toLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const currentMonthRange = () => {
  const now = new Date();
  return {
    dateFrom: toLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: toLocalIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

const mapMonthlyExpenses = (points: { month: string; amount: number }[]): MonthlyExpense[] =>
  points.map((point) => {
    const [year, month] = point.month.split('-').map(Number);
    return {
      month: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' }),
      amount: point.amount,
    };
  });

export function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<TransactionSummary>(emptySummary);
  const [spendingTrend, setSpendingTrend] = useState<MonthlyExpense[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<DetailedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [loadedSummary, monthlyPoints, recentPage] = await Promise.all([
        fetchTransactionSummary(currentMonthRange()),
        fetchMonthlyExpenses(6),
        fetchTransactions({ page: 1, pageSize: 5 }),
      ]);
      setSummary(loadedSummary);
      setSpendingTrend(mapMonthlyExpenses(monthlyPoints));
      setRecentTransactions(recentPage.items);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Unable to load dashboard data'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const currentMonthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <PageHeader
        eyebrow="Financial dashboard"
        title="Your financial overview"
        description="Server-side aggregates and recent activity from API v1."
        action={
          <button
            type="button"
            onClick={() => navigate(ROUTES.transactions)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-slate-800"
          >
            <Plus size={18} />
            Add transaction
          </button>
        }
      />

      {error && (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadDashboard(true)}
            disabled={isRefreshing}
            className="self-start rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold transition hover:bg-rose-100 disabled:opacity-50 sm:self-auto"
          >
            {isRefreshing ? 'Refreshing…' : 'Retry'}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-soft">
          Loading dashboard aggregates...
        </div>
      ) : (
        <>
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Expenses this month" value={formatCurrencyWithDecimals(summary.totalExpenses)} detail={currentMonthLabel} trend="up" icon={<ReceiptText size={20} />} />
            <MetricCard title="Income this month" value={formatCurrencyWithDecimals(summary.totalIncome)} detail={currentMonthLabel} trend="neutral" icon={<Wallet size={20} />} />
            <MetricCard title="Balance" value={formatCurrencyWithDecimals(summary.balance)} detail="Income minus expenses this month" trend={summary.balance < 0 ? 'warning' : 'neutral'} icon={<PiggyBank size={20} />} />
            <MetricCard title="Recurring this month" value={String(summary.recurringCount)} detail="Persisted recurring movements" trend="neutral" icon={<Repeat size={20} />} />
          </section>

          <section className="mt-6">
            <SpendingChart data={spendingTrend} />
          </section>

          <div className="mt-6">
            <RecentTransactionsTable transactions={recentTransactions} />
          </div>
        </>
      )}
    </>
  );
}
