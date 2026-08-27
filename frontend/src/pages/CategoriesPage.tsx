import { Archive, Check, Pencil, Plus, RotateCcw, Tags } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { ApiErrorAlert } from '../components/ui/ApiErrorAlert';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  archiveCategory,
  createCategory,
  fetchCategories,
  renameCategory,
  restoreCategory,
} from '../services/categoriesApi';
import { getApiErrorPresentation, type ApiErrorPresentation } from '../services/apiClient';
import type { TransactionCategory, TransactionType } from '../types/transactions';

export function CategoriesPage() {
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [name, setName] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType>('expense');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [reassignTargets, setReassignTargets] = useState<Record<string, string>>({});
  const [archiveCandidate, setArchiveCandidate] = useState<TransactionCategory | null>(null);
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setCategories(await fetchCategories(true));
    } catch (loadError) {
      setError(getApiErrorPresentation(loadError, 'Unable to load categories.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCategories = useMemo(
    () => categories.filter((category) => !category.archived),
    [categories],
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setBusyId('create');
      setError(null);
      await createCategory({ name, transactionType });
      setName('');
      setMessage('Category created.');
      await load();
    } catch (createError) {
      setError(getApiErrorPresentation(createError, 'Unable to create category.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRename = async (categoryId: string) => {
    try {
      setBusyId(categoryId);
      setError(null);
      await renameCategory(categoryId, editingName);
      setEditingId(null);
      setMessage('Category renamed.');
      await load();
    } catch (renameError) {
      setError(getApiErrorPresentation(renameError, 'Unable to rename category.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async () => {
    if (!archiveCandidate) return;
    try {
      setBusyId(archiveCandidate.id);
      setError(null);
      await archiveCategory(archiveCandidate.id, { mode: 'archive' });
      setArchiveCandidate(null);
      setMessage('Category archived; historical assignments were preserved.');
      await load();
    } catch (archiveError) {
      setError(getApiErrorPresentation(archiveError, 'Unable to archive category.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleReassignAndArchive = async (category: TransactionCategory) => {
    const target = reassignTargets[category.id];
    if (!target) return;
    try {
      setBusyId(category.id);
      setError(null);
      await archiveCategory(category.id, { mode: 'reassign', reassignToCategoryId: target });
      setMessage('Transactions reassigned and category archived atomically.');
      await load();
    } catch (archiveError) {
      setError(getApiErrorPresentation(archiveError, 'Unable to reassign and archive category.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (categoryId: string) => {
    try {
      setBusyId(categoryId);
      setError(null);
      await restoreCategory(categoryId);
      setMessage('Category restored.');
      await load();
    } catch (restoreError) {
      setError(getApiErrorPresentation(restoreError, 'Unable to restore category.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main>
      <PageHeader
        eyebrow="Classification"
        title="Categories"
        description="Keep system categories stable while adding account-owned categories for the way you actually budget and review spending."
      />

      {error && <ApiErrorAlert error={error} className="mb-6" onRetry={() => void load()} />}
      {message && <p role="status" className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>}

      <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Plus size={18} /></div>
          <div>
            <h2 className="font-bold text-slate-950">Create a personal category</h2>
            <p className="text-sm text-slate-500">Personal names can coexist across different transaction types, but cannot shadow a visible category of the same type.</p>
          </div>
        </div>
        <form onSubmit={(event) => void handleCreate(event)} className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
          <label className="text-sm font-semibold text-slate-700">Name
            <input aria-label="Category name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-brand-500" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Type
            <select aria-label="Category type" value={transactionType} onChange={(event) => setTransactionType(event.target.value as TransactionType)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-brand-500">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <button type="submit" disabled={busyId === 'create'} className="self-end rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busyId === 'create' ? 'Creating...' : 'Create category'}</button>
        </form>
      </section>

      {loading ? (
        <p className="text-sm text-slate-500">Loading categories...</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {categories.map((category) => {
            const isPersonal = category.scope === 'user';
            const targets = activeCategories.filter(
              (target) => target.id !== category.id && target.transactionType === category.transactionType,
            );
            return (
              <article key={category.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"><Tags size={18} /></div>
                    <div>
                      {editingId === category.id ? (
                        <div className="flex gap-2">
                          <input aria-label={`Rename ${category.name}`} value={editingName} onChange={(event) => setEditingName(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                          <button type="button" aria-label="Save category name" onClick={() => void handleRename(category.id)} className="rounded-xl bg-brand-600 px-3 text-white"><Check size={16} /></button>
                        </div>
                      ) : <h2 className="font-bold text-slate-950">{category.name}</h2>}
                      <p className="mt-1 text-sm text-slate-500">{category.transactionType} · {isPersonal ? 'personal' : 'system'} · {category.transactionCount ?? 0} transactions</p>
                    </div>
                  </div>
                  {category.archived && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Archived</span>}
                </div>

                {isPersonal && !category.archived && (
                  <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setEditingId(category.id); setEditingName(category.name); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><Pencil size={14} /> Rename</button>
                      <button type="button" onClick={() => setArchiveCandidate(category)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><Archive size={14} /> Archive & keep history</button>
                    </div>
                    {targets.length > 0 && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select aria-label={`Reassign ${category.name} transactions`} value={reassignTargets[category.id] ?? ''} onChange={(event) => setReassignTargets((current) => ({ ...current, [category.id]: event.target.value }))} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                          <option value="">Reassign transactions to...</option>
                          {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                        </select>
                        <button type="button" disabled={!reassignTargets[category.id] || busyId === category.id} onClick={() => void handleReassignAndArchive(category)} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Reassign & archive</button>
                      </div>
                    )}
                  </div>
                )}

                {isPersonal && category.archived && (
                  <button type="button" onClick={() => void handleRestore(category.id)} disabled={busyId === category.id} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><RotateCcw size={14} /> Restore category</button>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={archiveCandidate !== null}
        title="Archive category and keep history?"
        description={`Existing transactions will remain assigned to ${archiveCandidate?.name ?? 'this category'}, but it will no longer be available for new transactions or new budgets.`}
        confirmLabel="Archive & keep history"
        isConfirming={archiveCandidate ? busyId === archiveCandidate.id : false}
        onCancel={() => setArchiveCandidate(null)}
        onConfirm={() => void handleArchive()}
      />
    </main>
  );
}
