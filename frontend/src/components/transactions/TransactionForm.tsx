import { Check, LoaderCircle, Plus, Sparkles, X } from 'lucide-react';
import { useRef, type FormEvent } from 'react';
import { formatMoneyEditingInput, formatMoneyInput } from '../../utils/money';
import type {
  CategorySuggestionPreview,
  TransactionCategory,
  TransactionFormValues,
} from '../../types/transactions';

interface TransactionFormProps {
  categories: TransactionCategory[];
  values: TransactionFormValues;
  suggestion?: CategorySuggestionPreview | null;
  isEditing?: boolean;
  isSubmitting?: boolean;
  isSuggesting?: boolean;
  onChange: (values: TransactionFormValues) => void;
  onSubmit: () => void;
  onRequestSuggestion?: () => void;
  onAcceptSuggestion?: () => void;
  onDismissSuggestion?: () => void;
  onCancelEdit?: () => void;
}

export function TransactionForm({
  categories,
  values,
  suggestion = null,
  isEditing = false,
  isSubmitting = false,
  isSuggesting = false,
  onChange,
  onSubmit,
  onRequestSuggestion,
  onAcceptSuggestion,
  onDismissSuggestion,
  onCancelEdit,
}: TransactionFormProps) {
  const categorySelectRef = useRef<HTMLSelectElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isSubmitting) {
      onSubmit();
    }
  };

  const chooseAnotherCategory = () => {
    onDismissSuggestion?.();
    categorySelectRef.current?.focus();
  };

  return (
    <form
      aria-label={isEditing ? 'Formulario para editar movimiento' : 'Formulario para añadir movimiento'}
      onSubmit={handleSubmit}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft"
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{isEditing ? 'Editar movimiento' : 'Añadir movimiento'}</h2>
          <p className="text-sm text-slate-500">
            {isEditing
              ? 'Actualiza los datos del movimiento seleccionado.'
              : 'Añade un ingreso o gasto manualmente.'}
          </p>
        </div>

        {isEditing && onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={isSubmitting}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Cancelar edición"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Comercio</span>
          <input
            aria-label="Comercio"
            value={values.merchant}
            onChange={(event) => onChange({ ...values, merchant: event.target.value })}
            placeholder="Ej. Mercadona"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Importe</span>
          <input
            aria-label="Importe"
            value={values.amount}
            onChange={(event) => onChange({ ...values, amount: formatMoneyEditingInput(event.target.value) })}
            onFocus={() => {
              if (!values.amount.trim()) return;
              onChange({ ...values, amount: formatMoneyEditingInput(values.amount) });
            }}
            onBlur={() => {
              if (!values.amount.trim()) return;
              try { onChange({ ...values, amount: formatMoneyInput(values.amount) }); } catch { /* Validation happens on submit. */ }
            }}
            type="text"
            inputMode="decimal"
            placeholder="0,00 €"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
            required
          />
        </label>

        {!isEditing && onRequestSuggestion && (
          <div className="md:col-span-2">
            {suggestion ? (
              <section
                aria-label="Sugerencia de categoría"
                className="rounded-2xl border border-brand-100 bg-brand-50 p-4"
              >
                <div className="flex items-start gap-3">
                  <Sparkles size={18} className="mt-0.5 shrink-0 text-brand-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                      Categoría sugerida
                    </p>
                    <p className="mt-1 text-base font-bold text-slate-950">{suggestion.categoryName}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {suggestion.source === 'user_history'
                        ? 'Basado en cómo clasificaste este comercio anteriormente.'
                        : 'Sugerencia basada en el nombre del comercio.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-label="Aceptar"
                        onClick={onAcceptSuggestion}
                        className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        aria-label="Cambiar"
                        onClick={chooseAnotherCategory}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <button
                type="button"
                onClick={onRequestSuggestion}
                disabled={isSuggesting || values.merchant.trim().length === 0}
                className="inline-flex items-center gap-2 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSuggesting ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isSuggesting ? 'Buscando sugerencia...' : 'Sugerir categoría'}
              </button>
            )}
          </div>
        )}

        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold text-slate-700">Descripción</span>
          <input aria-label="Descripción"
            value={values.description}
            onChange={(event) => onChange({ ...values, description: event.target.value })}
            placeholder="Ej. Compra semanal"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Categoría</span>
          <select aria-label="Categoría"
            ref={categorySelectRef}
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
          <span className="text-sm font-semibold text-slate-700">Fecha</span>
          <input aria-label="Fecha"
            value={values.date}
            onChange={(event) => onChange({ ...values, date: event.target.value })}
            type="date"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
            required
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Tipo</span>
          <select aria-label="Tipo"
            value={values.type}
            onChange={(event) => onChange({ ...values, type: event.target.value as TransactionFormValues['type'] })}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="expense">Gasto</option>
            <option value="income">Ingreso</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Método de pago</span>
          <select aria-label="Método de pago"
            value={values.paymentMethod}
            onChange={(event) =>
              onChange({ ...values, paymentMethod: event.target.value as TransactionFormValues['paymentMethod'] })
            }
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
          >
            <option value="card">Tarjeta</option>
            <option value="cash">Efectivo</option>
            <option value="bank_transfer">Transferencia</option>
            <option value="direct_debit">Domiciliación</option>
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
        Marcar como movimiento recurrente
      </label>

      <button
        type="submit"
        aria-label={isSubmitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Añadir movimiento'}
        disabled={isSubmitting}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {isSubmitting ? <LoaderCircle size={18} className="animate-spin" /> : isEditing ? <Check size={18} /> : <Plus size={18} />}
        {isSubmitting ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Añadir movimiento'}
      </button>
    </form>
  );
}