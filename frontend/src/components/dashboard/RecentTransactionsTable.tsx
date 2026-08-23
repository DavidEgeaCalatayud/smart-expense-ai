import type { DetailedTransaction } from '../../types/transactions';
import { formatCurrencyWithDecimals } from '../../utils/formatters';
import { Badge } from '../ui/Badge';

interface RecentTransactionsTableProps {
  transactions: DetailedTransaction[];
}

const statusTone = {
  normal: 'green',
  review: 'amber',
  anomaly: 'red',
} as const;

export function RecentTransactionsTable({ transactions }: RecentTransactionsTableProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Recent transactions</h2>
          <p className="text-sm text-slate-500">Latest persisted movements</p>
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
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                  No transactions yet. Add your first transaction to populate the dashboard.
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => (
                <tr key={transaction.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-4 font-semibold text-slate-900">{transaction.merchant}</td>
                  <td className="py-4 text-slate-500">{transaction.category}</td>
                  <td className="py-4 text-slate-500">{transaction.date}</td>
                  <td className="py-4">
                    <Badge tone={statusTone[transaction.status]}>{transaction.status}</Badge>
                  </td>
                  <td
                    className={`py-4 text-right font-bold ${
                      transaction.type === 'income' ? 'text-emerald-600' : 'text-slate-950'
                    }`}
                  >
                    {transaction.type === 'income' ? '+' : '-'}
                    {formatCurrencyWithDecimals(transaction.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
