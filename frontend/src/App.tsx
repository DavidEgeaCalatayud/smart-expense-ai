import { AlertTriangle, LineChart, PiggyBank, Plus, Wallet } from 'lucide-react';
import { AlertsPanel } from './components/dashboard/AlertsPanel';
import { MetricCard } from './components/dashboard/MetricCard';
import { RecentTransactionsTable } from './components/dashboard/RecentTransactionsTable';
import { SpendingChart } from './components/dashboard/SpendingChart';
import { AppShell } from './components/layout/AppShell';
import { alerts, monthlyExpenses, recentTransactions } from './data/dashboardData';
import { formatCurrency } from './utils/formatters';

function App() {
  return (
    <AppShell>
      <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">
            Financial intelligence dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
            Expense analysis with AI alerts
          </h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Track your spending, detect anomalies and predict future expenses before they become a problem.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-slate-800"
        >
          <Plus size={18} />
          Add transaction
        </button>
      </header>

      <section className="mb-6 rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-6 shadow-soft">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div>
            <p className="text-sm font-semibold text-brand-700">AI monthly forecast</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
              You are projected to spend {formatCurrency(1470)} this month
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              The system detected higher shopping activity and two recurring subscription payments that should be reviewed.
            </p>
          </div>
          <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Risk level</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">Medium</p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Monthly spending"
          value={formatCurrency(1290)}
          detail="12% above average"
          trend="up"
          icon={<Wallet size={20} />}
        />
        <MetricCard
          title="Predicted total"
          value={formatCurrency(1470)}
          detail="End-of-month forecast"
          trend="up"
          icon={<LineChart size={20} />}
        />
        <MetricCard
          title="Potential savings"
          value={formatCurrency(215)}
          detail="Based on recurring costs"
          trend="down"
          icon={<PiggyBank size={20} />}
        />
        <MetricCard
          title="Active alerts"
          value="3"
          detail="1 high priority"
          trend="warning"
          icon={<AlertTriangle size={20} />}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <SpendingChart data={monthlyExpenses} />
        <AlertsPanel alerts={alerts} />
      </section>

      <div className="mt-6">
        <RecentTransactionsTable transactions={recentTransactions} />
      </div>
    </AppShell>
  );
}

export default App;
