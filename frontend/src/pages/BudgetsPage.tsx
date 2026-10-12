import { Pencil, Plus, Trash2, WalletCards, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { ApiErrorAlert } from '../components/ui/ApiErrorAlert';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { getApiErrorPresentation, type ApiErrorPresentation } from '../services/apiClient';
import { createBudget, deleteBudget, fetchBudgets, updateBudget } from '../services/budgetsApi';
import { fetchCategories } from '../services/categoriesApi';
import type { BudgetMonth, BudgetProgress } from '../types/budgets';
import type { TransactionCategory } from '../types/transactions';
import { formatMoneyInput, formatMoneyWithDecimals, normalizeMoneyAmount } from '../utils/money';
import { Skeleton } from '../components/ui/Skeleton';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function progressWidth(percent: string): string {
  const value = Number.parseFloat(percent);
  if (!Number.isFinite(value)) return '0%';
  return `${Math.max(0, Math.min(100, value))}%`;
}

function BudgetCard({
  budget,
  editing,
  editAmount,
  busy,
  onEdit,
  onEditAmount,
  onSave,
  onCancel,
  onDelete,
}: {
  budget: BudgetProgress;
  editing: boolean;
  editAmount: string;
  busy: boolean;
  onEdit: () => void;
  onEditAmount: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{budget.categoryName ?? 'Gasto general'}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{formatMoneyWithDecimals(budget.spentAmount)} <span className="text-base font-medium text-slate-400">/ {formatMoneyWithDecimals(budget.limitAmount)}</span></p>
          {budget.categoryArchived && <p className="mt-2 text-xs font-semibold text-amber-700">Categoría archivada · se conserva el historial</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label={`Edit ${budget.categoryName ?? 'overall'} budget`} onClick={onEdit} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><Pencil size={15} /></button>
          <button type="button" aria-label={`Delete ${budget.categoryName ?? 'overall'} budget`} onClick={onDelete} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${budget.overBudget ? 'bg-rose-500' : 'bg-brand-600'}`} style={{ width: progressWidth(budget.percentUsed) }} /></div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
        <span className={budget.overBudget ? 'font-semibold text-rose-600' : 'text-slate-500'}>{budget.overBudget ? `${formatMoneyWithDecimals(budget.remainingAmount)} restantes` : `${formatMoneyWithDecimals(budget.remainingAmount)} restantes`}</span>
        <span className="text-slate-500">{budget.percentUsed}% usado · {budget.daysRemaining} días restantes</span>
      </div>
      {editing && (
        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
          <input
            autoFocus
            aria-label="Updated budget amount"
            value={editAmount}
            onChange={(event) => onEditAmount(event.target.value)}
            onFocus={() => {
              if (!editAmount.trim()) return;
              try { onEditAmount(normalizeMoneyAmount(editAmount)); } catch { /* Keep invalid input editable. */ }
            }}
            onBlur={() => {
              if (!editAmount.trim()) return;
              try { onEditAmount(formatMoneyInput(editAmount)); } catch { /* Validation happens on save. */ }
            }}
            inputMode="decimal"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <button type="button" disabled={busy} onClick={onSave} className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Guardar</button>
          <button type="button" aria-label="Cancel budget edit" onClick={onCancel} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><X size={15} /></button>
        </div>
      )}
    </article>
  );
}

export function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [overview, setOverview] = useState<BudgetMonth | null>(null);
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [scope, setScope] = useState('overall');
  const [limitAmount, setLimitAmount] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState<BudgetProgress | null>(null);
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [budgetResult, categoryResult] = await Promise.all([fetchBudgets(month), fetchCategories()]);
      setOverview(budgetResult);
      setCategories(categoryResult);
    } catch (loadError) {
      setError(getApiErrorPresentation(loadError, 'No se han podido cargar los presupuestos.'));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.transactionType === 'expense' && !category.archived),
    [categories],
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setBusyId('create');
      setError(null);
      await createBudget({
        month,
        categoryId: scope === 'overall' ? null : scope,
        limitAmount: normalizeMoneyAmount(limitAmount),
      });
      setLimitAmount('');
      setMessage('Presupuesto creado.');
      await load();
    } catch (createError) {
      setError(getApiErrorPresentation(createError, 'No se ha podido crear el presupuesto.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (budgetId: string) => {
    try {
      setBusyId(budgetId);
      setError(null);
      await updateBudget(budgetId, normalizeMoneyAmount(editAmount));
      setEditingId(null);
      setMessage('Presupuesto actualizado.');
      await load();
    } catch (updateError) {
      setError(getApiErrorPresentation(updateError, 'No se ha podido actualizar el presupuesto.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteCandidate) return;
    try {
      setBusyId(deleteCandidate.id);
      setError(null);
      await deleteBudget(deleteCandidate.id);
      setDeleteCandidate(null);
      setMessage('Presupuesto eliminado.');
      await load();
    } catch (deleteError) {
      setError(getApiErrorPresentation(deleteError, 'No se ha podido eliminar el presupuesto.'));
    } finally {
      setBusyId(null);
    }
  };

  const allBudgets = overview ? [overview.totalBudget, ...overview.categoryBudgets].filter((item): item is BudgetProgress => item !== null) : [];

  return (
    <main>
      <PageHeader
        eyebrow="Planificación"
        title="Presupuestos"
        description="Define límites mensuales y controla cuánto te queda disponible en cada categoría."
        action={<label className="text-sm font-semibold text-slate-700">Mes<input aria-label="Budget month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="ml-3 rounded-xl border border-slate-200 px-3 py-2 font-normal" /></label>}
      />

      {error && <ApiErrorAlert error={error} className="mb-6" onRetry={() => void load()} />}
      {message && <p role="status" className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>}

      <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Plus size={18} /></div><div><h2 className="font-bold text-slate-950">Añadir presupuesto</h2><p className="text-sm text-slate-500">Puedes crear un límite general o uno específico para cada categoría de gasto.</p></div></div>
        <form onSubmit={(event) => void handleCreate(event)} className="grid gap-4 md:grid-cols-[1fr_220px_auto]">
          <label className="text-sm font-semibold text-slate-700">Scope
            <select aria-label="Budget scope" value={scope} onChange={(event) => setScope(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal">
              <option value="overall">Gasto general</option>
              {expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">Límite mensual
            <input
              aria-label="Budget limit"
              required
              inputMode="decimal"
              placeholder="400,00 €"
              value={limitAmount}
              onChange={(event) => setLimitAmount(event.target.value)}
              onFocus={() => {
                if (!limitAmount.trim()) return;
                try { setLimitAmount(normalizeMoneyAmount(limitAmount)); } catch { /* Keep invalid input editable. */ }
              }}
              onBlur={() => {
                if (!limitAmount.trim()) return;
                try { setLimitAmount(formatMoneyInput(limitAmount)); } catch { /* Validation happens on submit. */ }
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal"
            />
          </label>
          <button type="submit" aria-label="Create budget" disabled={busyId === 'create'} className="self-end rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busyId === 'create' ? 'Creando…' : 'Crear presupuesto'}</button>
        </form>
      </section>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-2" role="status" aria-label="Cargando presupuestos">
          {[0, 1].map((item) => <div key={item} className="rounded-3xl border border-slate-200 bg-white p-5"><Skeleton className="h-4 w-1/3" /><Skeleton className="mt-4 h-8 w-1/2" /><Skeleton className="mt-5 h-3 w-full" /></div>)}
        </div>
      ) : allBudgets.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><WalletCards className="mx-auto text-slate-400" /><h2 className="mt-4 font-bold">No hay presupuestos para {month}</h2><p className="mt-2 text-sm text-slate-500">Crea un presupuesto general o por categoría para seguir tu progreso mensual.</p></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {allBudgets.map((budget) => <BudgetCard key={budget.id} budget={budget} editing={editingId === budget.id} editAmount={editAmount} busy={busyId === budget.id} onEdit={() => { setEditingId(budget.id); setEditAmount(budget.limitAmount); }} onEditAmount={setEditAmount} onSave={() => void handleSave(budget.id)} onCancel={() => setEditingId(null)} onDelete={() => setDeleteCandidate(budget)} />)}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteCandidate !== null}
        title="¿Eliminar este presupuesto?"
        description={`Se eliminará el presupuesto ${deleteCandidate?.categoryName ?? 'overall'} de ${deleteCandidate?.month ?? month}. Tus movimientos no se eliminarán.`}
        confirmLabel="Eliminar presupuesto"
        isConfirming={deleteCandidate ? busyId === deleteCandidate.id : false}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void handleDelete()}
      />
    </main>
  );
}
