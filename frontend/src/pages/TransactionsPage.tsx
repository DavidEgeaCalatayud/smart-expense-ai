import { Download, Plus } from 'lucide-react';
import { RecentTransactionsTable } from '../components/dashboard/RecentTransactionsTable';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { recentTransactions } from '../data/dashboardData';

const categories = [
  { label: 'Food', value: '€420', tone: 'green' },
  { label: 'Subscriptions', value: '€86', tone: 'blue' },
  { label: 'Shopping', value: '€310', tone: 'amber' },
  { label: 'Transport', value: '€155', tone: 'slate' },
] as const;

export function TransactionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Transaction management"
        title="Transactions"
        description="Review, classify and prepare your financial movements for AI analysis."
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Download size={18} />
              Import CSV
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              <Plus size={18} />
              Add transaction
            </button>
          </div>
        }
      />

      <section className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {categories.map((category) => (
          <article key={category.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{category.label}</p>
              <Badge tone={category.tone}>{category.label}</Badge>
            </div>
            <p className="text-2xl font-bold tracking-tight">{category.value}</p>
            <p className="mt-2 text-sm text-slate-500">Current month detected spending</p>
          </article>
        ))}
      </section>

      <RecentTransactionsTable transactions={recentTransactions} />
    </>
  );
}
