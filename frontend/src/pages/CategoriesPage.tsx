import { Archive, Check, Pencil, Plus, RotateCcw, Tags } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { ApiErrorAlert } from '../components/ui/ApiErrorAlert';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Skeleton } from '../components/ui/Skeleton';
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
      setError(getApiErrorPresentation(loadError, 'No se han podido cargar las categorías.'));
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
      setMessage('Categoría creada.');
      await load();
    } catch (createError) {
      setError(getApiErrorPresentation(createError, 'No se ha podido crear la categoría.'));
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
      setMessage('Categoría renombrada.');
      await load();
    } catch (renameError) {
      setError(getApiErrorPresentation(renameError, 'No se ha podido renombrar la categoría.'));
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
      setMessage('Categoría archivada. Se conserva el historial.');
      await load();
    } catch (archiveError) {
      setError(getApiErrorPresentation(archiveError, 'No se ha podido archivar la categoría.'));
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
      setMessage('Movimientos reasignados y categoría archivada.');
      await load();
    } catch (archiveError) {
      setError(getApiErrorPresentation(archiveError, 'No se ha podido reasignar y archivar la categoría.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (categoryId: string) => {
    try {
      setBusyId(categoryId);
      setError(null);
      await restoreCategory(categoryId);
      setMessage('Categoría restaurada.');
      await load();
    } catch (restoreError) {
      setError(getApiErrorPresentation(restoreError, 'No se ha podido restaurar la categoría.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main>
      <PageHeader
        eyebrow="Organización"
        title="Categorías"
        description="Organiza tus ingresos y gastos con categorías propias sin perder el historial."
      />

      {error && <ApiErrorAlert error={error} className="mb-6" onRetry={() => void load()} />}
      {message && <p role="status" className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>}

      <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Plus size={18} /></div>
          <div>
            <h2 className="font-bold text-slate-950">Crear una categoría</h2>
            <p className="text-sm text-slate-500">Crea categorías personales para adaptar la app a tu forma de gestionar el dinero.</p>
          </div>
        </div>
        <form onSubmit={(event) => void handleCreate(event)} className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
          <label className="text-sm font-semibold text-slate-700">Nombre
            <input aria-label="Category name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-brand-500" />
          </label>
          <label className="text-sm font-semibold text-slate-700">Tipo
            <select aria-label="Category type" value={transactionType} onChange={(event) => setTransactionType(event.target.value as TransactionType)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-brand-500">
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
            </select>
          </label>
          <button type="submit" aria-label="Create category" disabled={busyId === 'create'} className="self-end rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busyId === 'create' ? 'Creando…' : 'Crear categoría'}</button>
        </form>
      </section>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-2" role="status" aria-label="Cargando categorías">
          {[0, 1, 2, 3].map((item) => <div key={item} className="rounded-3xl border border-slate-200 bg-white p-5"><Skeleton className="h-5 w-1/3" /><Skeleton className="mt-3 h-4 w-2/3" /></div>)}
        </div>
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
                          <input aria-label={`Renombrar ${category.name}`} value={editingName} onChange={(event) => setEditingName(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                          <button type="button" aria-label="Save category name" onClick={() => void handleRename(category.id)} className="rounded-xl bg-brand-600 px-3 text-white"><Check size={16} /></button>
                        </div>
                      ) : <h2 className="font-bold text-slate-950">{category.name}</h2>}
                      <p className="mt-1 text-sm text-slate-500">{category.transactionType === 'expense' ? 'Gasto' : 'Ingreso'} · {isPersonal ? 'personal' : 'sistema'} · {category.transactionCount ?? 0} movimientos</p>
                    </div>
                  </div>
                  {category.archived && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">Archivada</span>}
                </div>

                {isPersonal && !category.archived && (
                  <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setEditingId(category.id); setEditingName(category.name); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><Pencil size={14} /> Renombrar</button>
                      <button type="button" aria-label="Archivar y conservar historial" onClick={() => setArchiveCandidate(category)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><Archive size={14} /> Archivar y conservar historial</button>
                    </div>
                    {targets.length > 0 && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select aria-label={`Reasignar movimientos de ${category.name}`} value={reassignTargets[category.id] ?? ''} onChange={(event) => setReassignTargets((current) => ({ ...current, [category.id]: event.target.value }))} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                          <option value="">Reasignar movimientos a...</option>
                          {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                        </select>
                        <button type="button" disabled={!reassignTargets[category.id] || busyId === category.id} onClick={() => void handleReassignAndArchive(category)} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Reasignar y archivar</button>
                      </div>
                    )}
                  </div>
                )}

                {isPersonal && category.archived && (
                  <button type="button" onClick={() => void handleRestore(category.id)} disabled={busyId === category.id} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"><RotateCcw size={14} /> Restaurar categoría</button>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={archiveCandidate !== null}
        title="¿Archivar la categoría y conservar el historial?"
        description={`Los movimientos existentes seguirán asignados a ${archiveCandidate?.name ?? 'esta categoría'}, pero la categoría dejará de estar disponible para nuevos movimientos y presupuestos.`}
        confirmLabel="Archivar y conservar historial"
        isConfirming={archiveCandidate ? busyId === archiveCandidate.id : false}
        onCancel={() => setArchiveCandidate(null)}
        onConfirm={() => void handleArchive()}
      />
    </main>
  );
}
