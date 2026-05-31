import { BrainCircuit, Repeat } from 'lucide-react';
import type { DetailedTransaction } from '../../types/transactions';
import { formatCurrencyWithDecimals } from '../../utils/formatters';
import { Badge } from '../ui/Badge';

interface TransactionsTableProps {
  transactions: DetailedTransaction[];
}

const statusTone = {
  normal: 'green',
  review: 'amber',
  anomaly: 'red',
} as const;

const typeTone = {
  expense: 'slate',
  income: 'green',
} as const;

const paymentMethodLabels = {
  card: 'Card',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  direct_debit: 'Direct debit',
};

export function TransactionsTable({ transactions }: TransactionsTableProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold">Transaction list</h2>
          <p className="text-sm text-slate-500">Detailed movements prepared for AI classification.</p>
        </div>
        <Badge tone="brand">{transactions.length} results</Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-3 font-semibold">Merchant</th>
              <th className="pb-3 font-semibold">Description</th>
              <th className="pb-3 font-semibold">Category</th>
              <th className="pb-3 font-semibold">Date</th>
              <th className="pb-3 font-semibold">Type</th>
              <th className="pb-3 font-semibold">Method</th>
              <th className="pb-3 font-semibold">AI</th>
              <th className="pb-3 font-semibold">Status</th>
              <th className="pb-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="border-b border-slate-100 last:border-0">
                <td className="py-4">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    {transaction.merchant}
                    {transaction.isRecurring && (
                      <span title="Recurring transaction" className="text-brand-600">
                        <Repeat size={15} />
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-4 text-slate-500">{transaction.description || 'No description'}</td>
                <td className="py-4 text-slate-500">{transaction.category}</td>
                <td className="py-4 text-slate-500">{transaction.date}</td>
                <td className="py-4">
                  <Badge tone={typeTone[transaction.type]}>{transaction.type}</Badge>
                </td>
                <td className="py-4 text-slate-500">{paymentMethodLabels[transaction.paymentMethod]}</td>
                <td className="py-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    <BrainCircuit size={14} />
                    {transaction.aiConfidence}%
                  </div>
                </td>
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
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
