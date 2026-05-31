import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Brain,
  CreditCard,
  LayoutDashboard,
  LineChart,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { alerts, monthlyExpenses, recentTransactions } from './data/dashboardData';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);

function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-slate-200 bg-white px-6 py-6">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-soft">
              <Brain size={24} />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">Smart Expense AI</p>
              <p className="text-sm text-slate-500">Predictive finance</p>
            </div>
          </div>

          <nav className="space-y-2">
            {[
              { icon: LayoutDashboard, label: 'Dashboard', active: true },
              { icon: CreditCard, label: 'Transactions' },
              { icon: LineChart, label: 'Predictions' },
              { icon: Bell, label: 'Alerts' },
              { icon: ShieldCheck, label: 'Security' },
            ].map((item) => (
              <button
                key={item.label}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                  item.active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-10 rounded-3xl bg-slate-950 p-5 text-white shadow-soft">
            <p className="mb-2 text-sm font-semibold">AI Insight</p>
            <p className="text-sm leading-6 text-slate-300">
              Your spending is trending 12% above your usual monthly average.
            </p>
          </div>
        </aside>

        <section className="px-6 py-6 lg:px-10">
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

            <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800">
              Add transaction
            </button>
          </header>

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
              icon={<ArrowDownRight size={20} />}
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
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Spending trend</h2>
                  <p className="text-sm text-slate-500">Historical monthly expenses</p>
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                  AI forecast ready
                </span>
              </div>

              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyExpenses} margin={{ left: 0, right: 16, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" stroke="#64748b" tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#0284c7"
                      strokeWidth={3}
                      fill="url(#expenseGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
              <h2 className="text-lg font-bold">AI alerts</h2>
              <p className="mb-5 text-sm text-slate-500">Automatic anomaly detection</p>
              <div className="space-y-4">
                {alerts.map((alert) => (
                  <article key={alert.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold">{alert.title}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getSeverityClass(alert.severity)}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-slate-500">{alert.message}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Recent transactions</h2>
                <p className="text-sm text-slate-500">Latest detected movements</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-3 font-semibold">Merchant</th>
                    <th className="pb-3 font-semibold">Category</th>
                    <th className="pb-3 font-semibold">Date</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-4 font-semibold text-slate-900">{transaction.merchant}</td>
                      <td className="py-4 text-slate-500">{transaction.category}</td>
                      <td className="py-4 text-slate-500">{transaction.date}</td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(transaction.status)}`}>
                          {transaction.status}
                        </span>
                      </td>
                      <td className="py-4 text-right font-bold">{formatCurrency(transaction.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  detail: string;
  trend: 'up' | 'down' | 'warning';
  icon: React.ReactNode;
}

function MetricCard({ title, value, detail, trend, icon }: MetricCardProps) {
  const trendClass = {
    up: 'bg-amber-50 text-amber-700',
    down: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-red-50 text-red-700',
  }[trend];

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          {icon}
        </div>
        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${trendClass}`}>
          {trend === 'down' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
          Live
        </span>
      </div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </article>
  );
}

function getSeverityClass(severity: 'low' | 'medium' | 'high') {
  const classes = {
    low: 'bg-blue-50 text-blue-700',
    medium: 'bg-amber-50 text-amber-700',
    high: 'bg-red-50 text-red-700',
  };

  return classes[severity];
}

function getStatusClass(status: 'normal' | 'review' | 'anomaly') {
  const classes = {
    normal: 'bg-emerald-50 text-emerald-700',
    review: 'bg-amber-50 text-amber-700',
    anomaly: 'bg-red-50 text-red-700',
  };

  return classes[status];
}

export default App;
