import { BrainCircuit, Pencil, Repeat, Trash2 } from 'lucide-react';
import type { DetailedTransaction } from '../../types/transactions';
import { formatCurrencyWithDecimals } from '../../utils/formatters';
import { Badge } from '../ui/Badge';

interface TransactionsTableProps {
  transactions: DetailedTransaction[];
  onEdit: (transaction: DetailedTransaction) => void;
  onDelete: (transactionId: string) => void;
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

export function TransactionsTable({ transactions, onEdit, onDelete }: TransactionsTableProps) {
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
        <table className="w-full min-w-[1160px] border-collapse text-left text-sm">
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
              <th className="pb-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-sm text-slate-500">
                  No transactions match the current filters.
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => (
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
                  <td className="py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(transaction)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                        aria-label={`Edit ${transaction.merchant}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(transaction.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 text-red-500 transition hover:bg-red-50"
                        aria-label={`Delete ${transaction.merchant}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
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
