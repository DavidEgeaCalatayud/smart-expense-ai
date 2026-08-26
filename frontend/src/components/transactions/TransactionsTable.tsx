import { Pencil, Repeat, Trash2 } from 'lucide-react';
import type { DetailedTransaction } from '../../types/transactions';
import { formatCurrencyWithDecimals } from '../../utils/formatters';
import { Badge } from '../ui/Badge';

interface TransactionsTableProps {
  transactions: DetailedTransaction[];
  emptyMessage?: string;
  onEdit: (transaction: DetailedTransaction) => void;
  onDelete: (transactionId: string) => void;
}

const statusTone = {
  normal: 'green',
  review: 'amber',
} as const;

const statusLabels = {
  normal: 'Normal',
  review: 'Needs review',
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

function TransactionActions({
  transaction,
  onEdit,
  onDelete,
}: {
  transaction: DetailedTransaction;
  onEdit: (transaction: DetailedTransaction) => void;
  onDelete: (transactionId: string) => void;
}) {
  return (
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
  );
}

function RecurringIndicator() {
  return (
    <Badge tone="brand">
      <span className="inline-flex items-center gap-1">
        <Repeat size={13} aria-hidden="true" />
        Recurring
      </span>
    </Badge>
  );
}

function TransactionAmount({ transaction }: { transaction: DetailedTransaction }) {
  return (
    <span className={`font-bold ${transaction.type === 'income' ? 'text-emerald-600' : 'text-slate-950'}`}>
      {transaction.type === 'income' ? '+' : '-'}
      {formatCurrencyWithDecimals(transaction.amount)}
    </span>
  );
}

export function TransactionsTable({
  transactions,
  emptyMessage = 'No transactions match the current filters.',
  onEdit,
  onDelete,
}: TransactionsTableProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold">Transaction list</h2>
          <p className="text-sm text-slate-500">Persistent movements with transparent rule-based review.</p>
        </div>
        <Badge tone="brand">{transactions.length} results</Badge>
      </div>

      {transactions.length === 0 ? (
        <div className="py-12 text-center" data-testid="transactions-empty-state">
          <p className="font-semibold text-slate-700">Nothing to show yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:hidden" data-testid="transaction-cards">
            {transactions.map((transaction) => (
              <article
                key={transaction.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4"
                aria-label={`${transaction.merchant} transaction`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-bold text-slate-950">{transaction.merchant}</h3>
                      {transaction.isRecurring && <RecurringIndicator />}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{transaction.description || 'No description'}</p>
                  </div>
                  <div className="shrink-0 text-right text-base">
                    <TransactionAmount transaction={transaction} />
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Category</dt>
                    <dd className="mt-1 font-medium text-slate-700">{transaction.category}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Date</dt>
                    <dd className="mt-1 font-medium text-slate-700">{transaction.date}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Method</dt>
                    <dd className="mt-1 font-medium text-slate-700">{paymentMethodLabels[transaction.paymentMethod]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Type</dt>
                    <dd className="mt-1">
                      <Badge tone={typeTone[transaction.type]}>{transaction.type}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Review</dt>
                    <dd className="mt-1">
                      <Badge tone={statusTone[transaction.status]}>{statusLabels[transaction.status]}</Badge>
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 border-t border-slate-200 pt-3">
                  <TransactionActions transaction={transaction} onEdit={onEdit} onDelete={onDelete} />
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto lg:block" data-testid="transaction-table">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-3 font-semibold">Merchant</th>
                  <th className="pb-3 font-semibold">Description</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Type</th>
                  <th className="pb-3 font-semibold">Method</th>
                  <th className="pb-3 font-semibold">Review</th>
                  <th className="pb-3 text-right font-semibold">Amount</th>
                  <th className="pb-3 text-right font-semibold">Actions</th>
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
                            <Repeat size={15} aria-hidden="true" />
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
                      <Badge tone={statusTone[transaction.status]}>{statusLabels[transaction.status]}</Badge>
                    </td>
                    <td className="py-4 text-right">
                      <TransactionAmount transaction={transaction} />
                    </td>
                    <td className="py-4">
                      <TransactionActions transaction={transaction} onEdit={onEdit} onDelete={onDelete} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
