import { Plus } from 'lucide-react';
import type { FormEvent } from 'react';
import type { TransactionCategory, TransactionFormValues } from '../../types/transactions';

interface TransactionFormProps {
  categories: TransactionCategory[];
  values: TransactionFormValues;
  onChange: (values: TransactionFormValues) => void;
  onSubmit: () => void;
}

export function TransactionForm({ categories, values, onChange, onSubmit }: TransactionFormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-6">
        <h2 className="text-lg font-bold">Add transaction</h2>
        <p className="text-sm text-slate-500">Create a manual movement until backend persistence is connected.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Merchant</span>
          <input
            value={values.merchant}
            onChange={(event) => onChange({ ...values, merchant: event.target.value })}
            placeholder="Example: Mercadona"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Amount</span>
          <input
            value={values.amount}
            onChange={(event) => onChange({ ...values, amount: event.target.value })}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
            required
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold text-slate-700">Description</span>
          <input
            value={values.description}
            onChange={(event) => onChange({ ...values, description: event.target.value })}
            placeholder="Example: Weekly groceries"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Category</span>
          <select
            value={values.category}
            onChange={(event) => onChange({ ...values, category: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Date</span>
          <input
            value={values.date}
            onChange={(event) => onChange({ ...values, date: event.target.value })}
            type="date"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Type</span>
          <select
            value={values.type}
            onChange={(event) => onChange({ ...values, type: event.target.value as TransactionFormValues['type'] })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Payment method</span>
          <select
            value={values.paymentMethod}
            onChange={(event) =>
              onChange({ ...values, paymentMethod: event.target.value as TransactionFormValues['paymentMethod'] })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="direct_debit">Direct debit</option>
          </select>
        </label>
      </div>

      <label className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={values.isRecurring}
          onChange={(event) => onChange({ ...values, isRecurring: event.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-brand-600"
        />
        Mark as recurring transaction
      </label>

      <button
        type="submit"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-slate-800"
      >
        <Plus size={18} />
        Add transaction
      </button>
    </form>
  );
}
