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
import { formatMoneyWithDecimals, normalizeMoneyAmount } from '../utils/money';

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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{budget.categoryName ?? 'Overall spending'}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{formatMoneyWithDecimals(budget.spentAmount)} <span className="text-base font-medium text-slate-400">/ {formatMoneyWithDecimals(budget.limitAmount)}</span></p>
          {budget.categoryArchived && <p className="mt-2 text-xs font-semibold text-amber-700">Category archived · historical budget retained</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label={`Edit ${budget.categoryName ?? 'overall'} budget`} onClick={onEdit} className="rounded-xl border border-slate-200 p-2 text-slate-500"><Pencil size={15} /></button>
          <button type="button" aria-label={`Delete ${budget.categoryName ?? 'overall'} budget`} onClick={onDelete} className="rounded-xl border border-slate-200 p-2 text-slate-500"><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${budget.overBudget ? 'bg-rose-500' : 'bg-brand-600'}`} style={{ width: progressWidth(budget.percentUsed) }} /></div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
        <span className={budget.overBudget ? 'font-semibold text-rose-600' : 'text-slate-500'}>{budget.overBudget ? `${formatMoneyWithDecimals(budget.remainingAmount)} remaining` : `${formatMoneyWithDecimals(budget.remainingAmount)} remaining`}</span>
        <span className="text-slate-500">{budget.percentUsed}% used · {budget.daysRemaining} days left</span>
      </div>
      {editing && (
        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
          <input aria-label="Updated budget amount" value={editAmount} onChange={(event) => onEditAmount(event.target.value)} inputMode="decimal" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <button type="button" disabled={busy} onClick={onSave} className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Save</button>
          <button type="button" aria-label="Cancel budget edit" onClick={onCancel} className="rounded-xl border border-slate-200 p-2 text-slate-500"><X size={15} /></button>
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
      setError(getApiErrorPresentation(loadError, 'Unable to load budgets.'));
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
      setMessage('Budget created.');
      await load();
    } catch (createError) {
      setError(getApiErrorPresentation(createError, 'Unable to create budget.'));
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
      setMessage('Budget updated.');
      await load();
    } catch (updateError) {
      setError(getApiErrorPresentation(updateError, 'Unable to update budget.'));
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
      setMessage('Budget deleted.');
      await load();
    } catch (deleteError) {
      setError(getApiErrorPresentation(deleteError, 'Unable to delete budget.'));
    } finally {
      setBusyId(null);
    }
  };

  const allBudgets = overview ? [overview.totalBudget, ...overview.categoryBudgets].filter((item): item is BudgetProgress => item !== null) : [];

  return (
    <main>
      <PageHeader
        eyebrow="Planning"
        title="Budgets"
        description="Set an overall monthly spending ceiling and category-level limits. Progress is calculated from persisted expense transactions, not client-side estimates."
        action={<label className="text-sm font-semibold text-slate-700">Month<input aria-label="Budget month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="ml-3 rounded-xl border border-slate-200 px-3 py-2 font-normal" /></label>}
      />

      {error && <ApiErrorAlert error={error} className="mb-6" onRetry={() => void load()} />}
      {message && <p role="status" className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>}

      <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Plus size={18} /></div><div><h2 className="font-bold text-slate-950">Add budget</h2><p className="text-sm text-slate-500">Only active expense categories can receive new category budgets.</p></div></div>
        <form onSubmit={(event) => void handleCreate(event)} className="grid gap-4 md:grid-cols-[1fr_220px_auto]">
          <label className="text-sm font-semibold text-slate-700">Scope
            <select aria-label="Budget scope" value={scope} onChange={(event) => setScope(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal">
              <option value="overall">Overall spending</option>
              {expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">Monthly limit
            <input aria-label="Budget limit" required inputMode="decimal" placeholder="400.00" value={limitAmount} onChange={(event) => setLimitAmount(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal" />
          </label>
          <button type="submit" disabled={busyId === 'create'} className="self-end rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busyId === 'create' ? 'Creating...' : 'Create budget'}</button>
        </form>
      </section>

      {loading ? <p className="text-sm text-slate-500">Loading budgets...</p> : allBudgets.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><WalletCards className="mx-auto text-slate-400" /><h2 className="mt-4 font-bold">No budgets for {month}</h2><p className="mt-2 text-sm text-slate-500">Create an overall or category budget to start tracking monthly progress.</p></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {allBudgets.map((budget) => <BudgetCard key={budget.id} budget={budget} editing={editingId === budget.id} editAmount={editAmount} busy={busyId === budget.id} onEdit={() => { setEditingId(budget.id); setEditAmount(budget.limitAmount); }} onEditAmount={setEditAmount} onSave={() => void handleSave(budget.id)} onCancel={() => setEditingId(null)} onDelete={() => setDeleteCandidate(budget)} />)}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteCandidate !== null}
        title="Delete this budget?"
        description={`This removes the ${deleteCandidate?.categoryName ?? 'overall'} budget for ${deleteCandidate?.month ?? month}. Transactions are never deleted.`}
        confirmLabel="Delete budget"
        isConfirming={deleteCandidate ? busyId === deleteCandidate.id : false}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void handleDelete()}
      />
    </main>
  );
}
