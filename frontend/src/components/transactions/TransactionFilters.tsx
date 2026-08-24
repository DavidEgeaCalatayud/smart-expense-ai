import { Search } from 'lucide-react';
import type { TransactionCategory, TransactionFilters } from '../../types/transactions';

interface TransactionFiltersProps {
  categories: TransactionCategory[];
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
}

export function TransactionFilters({ categories, filters, onChange }: TransactionFiltersProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <Search size={18} />
        </div>
        <div>
          <h2 className="text-base font-bold">Filters</h2>
          <p className="text-sm text-slate-500">Filters are applied by the API before pagination.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Search</span>
          <input
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="Merchant or description"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Category</span>
          <select
            value={filters.category}
            onChange={(event) => onChange({ ...filters, category: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Review status</span>
          <select
            value={filters.status}
            onChange={(event) => onChange({ ...filters, status: event.target.value as TransactionFilters['status'] })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="all">All statuses</option>
            <option value="normal">Normal</option>
            <option value="review">Needs review</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Type</span>
          <select
            value={filters.type}
            onChange={(event) => onChange({ ...filters, type: event.target.value as TransactionFilters['type'] })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="all">All types</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Recurring</span>
          <select
            value={filters.recurring}
            onChange={(event) => onChange({ ...filters, recurring: event.target.value as TransactionFilters['recurring'] })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="all">All movements</option>
            <option value="true">Recurring only</option>
            <option value="false">Non-recurring only</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">From</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">To</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => onChange({ ...filters, dateTo: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Sort</span>
          <select
            value={filters.sort}
            onChange={(event) => onChange({ ...filters, sort: event.target.value as TransactionFilters['sort'] })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount_high">Highest amount</option>
            <option value="amount_low">Lowest amount</option>
          </select>
        </label>
      </div>
    </section>
  );
}
