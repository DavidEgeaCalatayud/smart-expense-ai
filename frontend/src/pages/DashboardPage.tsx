import { PiggyBank, Plus, ReceiptText, Repeat, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MetricCard } from '../components/dashboard/MetricCard';
import { RecentTransactionsTable } from '../components/dashboard/RecentTransactionsTable';
import { SpendingChart } from '../components/dashboard/SpendingChart';
import { PageHeader } from '../components/layout/PageHeader';
import { ROUTES } from '../routes/paths';
import { fetchTransactions } from '../services/transactionsApi';
import type { MonthlyExpense } from '../types/dashboard';
import type { DetailedTransaction } from '../types/transactions';
import { formatCurrencyWithDecimals } from '../utils/formatters';

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const buildMonthlyExpenses = (transactions: DetailedTransaction[]): MonthlyExpense[] => {
  const today = new Date();

  return Array.from({ length: 6 }, (_, index) => {
    const monthOffset = 5 - index;
    const monthDate = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1);
    const monthKey = getMonthKey(monthDate);
    const amount = transactions
      .filter(
        (transaction) =>
          transaction.type === 'expense' && transaction.date.startsWith(monthKey),
      )
      .reduce((total, transaction) => total + transaction.amount, 0);

    return {
      month: monthDate.toLocaleDateString('en-US', { month: 'short' }),
      amount,
    };
  });
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to load dashboard data';

export function DashboardPage() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<DetailedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setTransactions(await fetchTransactions());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const currentMonthKey = getMonthKey(new Date());
  const currentMonthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const currentMonthTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.date.startsWith(currentMonthKey)),
    [currentMonthKey, transactions],
  );

  const monthlyExpenses = useMemo(
    () =>
      currentMonthTransactions
        .filter((transaction) => transaction.type === 'expense')
        .reduce((total, transaction) => total + transaction.amount, 0),
    [currentMonthTransactions],
  );

  const monthlyIncome = useMemo(
    () =>
      currentMonthTransactions
        .filter((transaction) => transaction.type === 'income')
        .reduce((total, transaction) => total + transaction.amount, 0),
    [currentMonthTransactions],
  );

  const monthlyBalance = monthlyIncome - monthlyExpenses;

  const recurringCount = useMemo(
    () => currentMonthTransactions.filter((transaction) => transaction.isRecurring).length,
    [currentMonthTransactions],
  );

  const spendingTrend = useMemo(() => buildMonthlyExpenses(transactions), [transactions]);
  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions]);

  return (
    <>
      <PageHeader
        eyebrow="Financial dashboard"
        title="Your financial overview"
        description="Track persisted income, expenses and recent activity from your real transaction data."
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
        <div
          role="alert"
          className="mb-6 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadTransactions()}
            className="self-start rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold transition hover:bg-rose-100 sm:self-auto"
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-soft">
          Loading dashboard data...
        </div>
      ) : (
        <>
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Expenses this month"
              value={formatCurrencyWithDecimals(monthlyExpenses)}
              detail={currentMonthLabel}
              trend="up"
              icon={<ReceiptText size={20} />}
            />
            <MetricCard
              title="Income this month"
              value={formatCurrencyWithDecimals(monthlyIncome)}
              detail={currentMonthLabel}
              trend="neutral"
              icon={<Wallet size={20} />}
            />
            <MetricCard
              title="Balance"
              value={formatCurrencyWithDecimals(monthlyBalance)}
              detail="Income minus expenses this month"
              trend={monthlyBalance < 0 ? 'warning' : 'neutral'}
              icon={<PiggyBank size={20} />}
            />
            <MetricCard
              title="Recurring this month"
              value={String(recurringCount)}
              detail="Persisted recurring movements"
              trend="neutral"
              icon={<Repeat size={20} />}
            />
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
