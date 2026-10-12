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
          <h2 className="text-base font-bold">Filtros</h2>
          <p className="text-sm text-slate-500">Ajusta los resultados por comercio, categoría, fecha o tipo.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Buscar</span>
          <input
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="Comercio o descripción"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Categoría</span>
          <select
            value={filters.category}
            onChange={(event) => onChange({ ...filters, category: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Estado de revisión</span>
          <select
            aria-label="Review status"
            value={filters.status}
            onChange={(event) => onChange({ ...filters, status: event.target.value as TransactionFilters['status'] })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="all">Todos los estados</option>
            <option value="normal">Normal</option>
            <option value="review">Requiere revisión</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Tipo</span>
          <select
            value={filters.type}
            onChange={(event) => onChange({ ...filters, type: event.target.value as TransactionFilters['type'] })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="all">Todos los tipos</option>
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Recurrente</span>
          <select
            value={filters.recurring}
            onChange={(event) => onChange({ ...filters, recurring: event.target.value as TransactionFilters['recurring'] })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="all">Todos los movimientos</option>
            <option value="true">Solo recurrentes</option>
            <option value="false">Solo no recurrentes</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Desde</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => onChange({ ...filters, dateFrom: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Hasta</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => onChange({ ...filters, dateTo: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Ordenar</span>
          <select
            value={filters.sort}
            onChange={(event) => onChange({ ...filters, sort: event.target.value as TransactionFilters['sort'] })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="newest">Más recientes primero</option>
            <option value="oldest">Más antiguos primero</option>
            <option value="amount_high">Mayor importe</option>
            <option value="amount_low">Menor importe</option>
          </select>
        </label>
      </div>
    </section>
  );
}
