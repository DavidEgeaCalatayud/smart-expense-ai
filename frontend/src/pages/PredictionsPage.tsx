import { BrainCircuit, CalendarClock, LineChart, TrendingUp } from 'lucide-react';
import { MetricCard } from '../components/dashboard/MetricCard';
import { SpendingChart } from '../components/dashboard/SpendingChart';
import { PageHeader } from '../components/layout/PageHeader';
import { monthlyExpenses } from '../data/dashboardData';
import { formatCurrency } from '../utils/formatters';

const predictionItems = [
  'Recurring subscriptions are expected to charge €82 during the next 30 days.',
  'Shopping expenses are trending above the last 3-month average.',
  'Food spending remains stable and does not require immediate action.',
];

export function PredictionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Predictive analysis"
        title="Predictions"
        description="Estimate future spending, recurring charges and financial risk before the month ends."
      />

      <section className="grid gap-5 md:grid-cols-3">
        <MetricCard
          title="Predicted spending"
          value={formatCurrency(1470)}
          detail="Estimated end-of-month total"
          trend="up"
          icon={<TrendingUp size={20} />}
        />
        <MetricCard
          title="Next recurring charges"
          value={formatCurrency(82)}
          detail="Expected in 30 days"
          trend="neutral"
          icon={<CalendarClock size={20} />}
        />
        <MetricCard
          title="Model confidence"
          value="74%"
          detail="Based on current mock dataset"
          trend="neutral"
          icon={<BrainCircuit size={20} />}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SpendingChart data={monthlyExpenses} />

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <LineChart size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Forecast explanation</h2>
              <p className="text-sm text-slate-500">Simple rules and statistical baseline</p>
            </div>
          </div>

          <div className="space-y-4">
            {predictionItems.map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
