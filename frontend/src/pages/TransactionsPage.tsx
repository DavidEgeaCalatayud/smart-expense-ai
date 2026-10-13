import { Download, ReceiptText, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRevealTarget } from '../hooks/useRevealTarget';
import { MetricCard } from '../components/dashboard/MetricCard';
import { PageHeader } from '../components/layout/PageHeader';
import { PaginationControls } from '../components/transactions/PaginationControls';
import { TransactionFilters } from '../components/transactions/TransactionFilters';
import { TransactionForm } from '../components/transactions/TransactionForm';
import { TransactionsTable } from '../components/transactions/TransactionsTable';
import { ApiErrorAlert } from '../components/ui/ApiErrorAlert';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Toast } from '../components/ui/Toast';
import { Skeleton } from '../components/ui/Skeleton';
import { fetchTransactionSummary } from '../services/analyticsApi';
import { getApiErrorPresentation, type ApiErrorPresentation } from '../services/apiClient';
import { fetchCategories } from '../services/categoriesApi';
import { previewCategorySuggestion } from '../services/categorySuggestionsApi';
import {
  createTransaction,
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
} from '../services/transactionsApi';
import type {
  CategorySuggestionPreview,
  DetailedTransaction,
  TransactionCategory,
  TransactionFilters as TransactionFiltersType,
  TransactionFormValues,
  TransactionPage,
  TransactionSummary,
} from '../types/transactions';
import { formatCurrency, formatCurrencyWithDecimals } from '../utils/formatters';
import { normalizeMoneyAmount } from '../utils/money';

const PAGE_SIZE = 10;

const buildDefaultFormValues = (category = ''): TransactionFormValues => ({
  merchant: '',
  description: '',
  category,
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  type: 'expense',
  paymentMethod: 'card',
  isRecurring: false,
});

const defaultFilters: TransactionFiltersType = {
  search: '',
  category: 'all',
  status: 'all',
  type: 'all',
  recurring: 'all',
  dateFrom: '',
  dateTo: '',
  sort: 'newest',
};

const emptyPage: TransactionPage = {
  items: [],
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  pages: 0,
};

const emptySummary: TransactionSummary = {
  totalIncome: '0.00',
  totalExpenses: '0.00',
  balance: '0.00',
  recurringCount: 0,
  reviewCount: 0,
  transactionCount: 0,
};

const mapTransactionToFormValues = (transaction: DetailedTransaction): TransactionFormValues => ({
  merchant: transaction.merchant,
  description: transaction.description,
  category: transaction.category,
  amount: transaction.amount,
  date: transaction.date,
  type: transaction.type,
  paymentMethod: transaction.paymentMethod,
  isRecurring: transaction.isRecurring,
});

export function TransactionsPage() {
  const [pageData, setPageData] = useState<TransactionPage>(emptyPage);
  const [summary, setSummary] = useState<TransactionSummary>(emptySummary);
  const [categories, setCategories] = useState<TransactionCategory[]>([]);
  const [formValues, setFormValues] = useState<TransactionFormValues>(() => buildDefaultFormValues());
  const [suggestion, setSuggestion] = useState<CategorySuggestionPreview | null>(null);
  const [filters, setFilters] = useState<TransactionFiltersType>(defaultFilters);
  const [queryFilters, setQueryFilters] = useState<TransactionFiltersType>(defaultFilters);
  const [page, setPage] = useState(1);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [transactionPendingDelete, setTransactionPendingDelete] = useState<DetailedTransaction | null>(null);
  const [hasLoadedPage, setHasLoadedPage] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const transactionFormReveal = useRevealTarget();

  const loadPage = useCallback(async () => {
    setIsPageLoading(true);
    try {
      const loadedPage = await fetchTransactions({ page, pageSize: PAGE_SIZE, filters: queryFilters });
      setPageData(loadedPage);
      setError(null);
    } catch (loadError) {
      setError(getApiErrorPresentation(loadError, 'No se han podido cargar los movimientos'));
    } finally {
      setHasLoadedPage(true);
      setIsPageLoading(false);
    }
  }, [page, queryFilters]);

  const loadSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    try {
      setSummary(await fetchTransactionSummary());
    } catch (loadError) {
      setError(getApiErrorPresentation(loadError, 'No se ha podido cargar el resumen'));
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadCategories = async () => {
      try {
        const loadedCategories = await fetchCategories();
        if (!isActive) return;

        setCategories(loadedCategories);
        setFormValues((current) => {
          const currentCategoryIsCompatible = loadedCategories.some(
            (category) =>
              category.transactionType === current.type && category.name === current.category,
          );
          if (currentCategoryIsCompatible) return current;

          const fallbackCategory =
            loadedCategories.find((category) => category.transactionType === current.type)?.name ?? '';
          return { ...current, category: fallbackCategory };
        });
      } catch (loadError) {
        if (isActive) setError(getApiErrorPresentation(loadError, 'No se han podido cargar las categorías'));
      }
    };

    void loadCategories();
    void loadSummary();

    return () => {
      isActive = false;
    };
  }, [loadSummary]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPage(1);
      setQueryFilters(filters);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [filters]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timeoutId = window.setTimeout(() => setSuccessMessage(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const compatibleFormCategories = useMemo(
    () => categories.filter((category) => category.transactionType === formValues.type),
    [categories, formValues.type],
  );

  const defaultExpenseCategory = useMemo(
    () => categories.find((category) => category.transactionType === 'expense')?.name ?? categories[0]?.name ?? '',
    [categories],
  );

  const handleFormChange = (nextValues: TransactionFormValues) => {
    const compatibleCategories = categories.filter((category) => category.transactionType === nextValues.type);
    const categoryIsCompatible = compatibleCategories.some((category) => category.name === nextValues.category);
    if (nextValues.merchant !== formValues.merchant || nextValues.type !== formValues.type) {
      setSuggestion(null);
    }

    setFormValues({
      ...nextValues,
      category: categoryIsCompatible ? nextValues.category : compatibleCategories[0]?.name ?? '',
    });
  };

  const handleRequestSuggestion = async () => {
    const merchant = formValues.merchant.trim();
    if (!merchant || editingTransactionId !== null) return;
    setError(null);
    setIsSuggesting(true);
    try {
      setSuggestion(await previewCategorySuggestion(merchant, formValues.type));
    } catch (suggestionError) {
      setSuggestion(null);
      setError(getApiErrorPresentation(suggestionError, 'No se ha podido sugerir una categoría'));
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAcceptSuggestion = () => {
    if (!suggestion) return;
    setFormValues((current) => ({ ...current, category: suggestion.categoryName }));
  };

  const refreshPageAndSummary = async () => {
    await Promise.all([loadPage(), loadSummary()]);
  };

  const handleSubmitTransaction = async () => {
    const isEditing = editingTransactionId !== null;
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const payload = { ...formValues, amount: normalizeMoneyAmount(formValues.amount) };
      if (editingTransactionId) {
        await updateTransaction(editingTransactionId, payload);
      } else {
        await createTransaction(payload);
      }

      setEditingTransactionId(null);
      setSuggestion(null);
      setFormValues(buildDefaultFormValues(defaultExpenseCategory));
      await refreshPageAndSummary();
      setSuccessMessage(isEditing ? 'Movimiento actualizado.' : 'Movimiento guardado.');
    } catch (submitError) {
      setError(getApiErrorPresentation(submitError, 'No se ha podido guardar el movimiento'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditTransaction = (transaction: DetailedTransaction) => {
    setError(null);
    setSuccessMessage(null);
    setSuggestion(null);
    setEditingTransactionId(transaction.id);
    setFormValues(mapTransactionToFormValues(transaction));
    transactionFormReveal.reveal();
  };

  const handleDeleteRequest = (transactionId: string) => {
    const transaction = pageData.items.find((item) => item.id === transactionId);
    if (transaction) {
      setError(null);
      setSuccessMessage(null);
      setTransactionPendingDelete(transaction);
    }
  };

  const handleConfirmDelete = async () => {
    if (!transactionPendingDelete) return;

    const transactionId = transactionPendingDelete.id;
    setError(null);
    setDeletingTransactionId(transactionId);

    try {
      await deleteTransaction(transactionId);

      if (editingTransactionId === transactionId) {
        setEditingTransactionId(null);
        setSuggestion(null);
        setFormValues(buildDefaultFormValues(defaultExpenseCategory));
      }

      if (pageData.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
        await loadSummary();
      } else {
        await refreshPageAndSummary();
      }
      setSuccessMessage('Movimiento eliminado.');
    } catch (deleteError) {
      setError(getApiErrorPresentation(deleteError, 'No se ha podido eliminar el movimiento'));
    } finally {
      setDeletingTransactionId(null);
      setTransactionPendingDelete(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingTransactionId(null);
    setSuggestion(null);
    setFormValues(buildDefaultFormValues(defaultExpenseCategory));
  };

  const isRefreshing = hasLoadedPage && isPageLoading;
  const emptyMessage =
    summary.transactionCount === 0
      ? 'Añade tu primer movimiento para empezar a construir tu historial financiero.'
      : 'No hay movimientos que coincidan con los filtros actuales. Prueba a cambiarlos o limpiarlos.';

  return (
    <>
      <PageHeader
        eyebrow="Actividad"
        title="Movimientos"
        description="Consulta, filtra y gestiona tus ingresos y gastos desde un único lugar."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshPageAndSummary()}
              disabled={isPageLoading || isSummaryLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={17} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Actualizando…' : 'Refresh'}
            </button>
            <button
              type="button"
              disabled
              title="La importación CSV está disponible desde su sección específica"
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-400 opacity-70 shadow-sm"
            >
              <Download size={18} />
              Import CSV
            </button>
          </div>
        }
      />

      {error && (
        <ApiErrorAlert
          error={error}
          className="mb-6"
          onRetry={() => void refreshPageAndSummary()}
        />
      )}

      <section className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Gastos totales" value={formatCurrency(summary.totalExpenses)} detail="Todos tus gastos" trend="up" icon={<ReceiptText size={20} />} />
        <MetricCard title="Ingresos totales" value={formatCurrency(summary.totalIncome)} detail="Todos tus ingresos" trend="down" icon={<ReceiptText size={20} />} />
        <MetricCard title="Recurrentes" value={String(summary.recurringCount)} detail="Movimientos recurrentes" trend="neutral" icon={<ReceiptText size={20} />} />
        <MetricCard title="Requieren revisión" value={String(summary.reviewCount)} detail="Movimientos que conviene revisar" trend="warning" icon={<ReceiptText size={20} />} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <div
          ref={transactionFormReveal.ref}
          className={transactionFormReveal.highlighted ? 'reveal-highlight rounded-3xl' : ''}
        >
          <TransactionForm
            categories={compatibleFormCategories}
            values={formValues}
            suggestion={suggestion}
            isEditing={editingTransactionId !== null}
            isSubmitting={isSubmitting || !hasLoadedPage || compatibleFormCategories.length === 0}
            isSuggesting={isSuggesting}
            onChange={handleFormChange}
            onSubmit={handleSubmitTransaction}
            onRequestSuggestion={() => void handleRequestSuggestion()}
            onAcceptSuggestion={handleAcceptSuggestion}
            onDismissSuggestion={() => setSuggestion(null)}
            onCancelEdit={handleCancelEdit}
          />
        </div>

        <div className="space-y-6">
          <TransactionFilters categories={categories} filters={filters} onChange={setFilters} />

          {!hasLoadedPage ? (
            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft" role="status" aria-label="Cargando movimientos">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="space-y-3" aria-busy={isPageLoading}>
              {isRefreshing && (
                <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700">
                  Actualizando resultados…
                </div>
              )}
              <TransactionsTable
                transactions={pageData.items}
                emptyMessage={emptyMessage}
                onAddFirst={summary.transactionCount === 0 ? transactionFormReveal.reveal : undefined}
                onEdit={handleEditTransaction}
                onDelete={handleDeleteRequest}
              />
              <PaginationControls
                page={pageData.page}
                pages={pageData.pages}
                total={pageData.total}
                pageSize={pageData.pageSize}
                disabled={isPageLoading}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        isOpen={transactionPendingDelete !== null}
        title="¿Eliminar movimiento?"
        description={
          transactionPendingDelete
            ? `${transactionPendingDelete.merchant} · ${formatCurrencyWithDecimals(transactionPendingDelete.amount)} will be permanently removed.`
            : ''
        }
        confirmLabel="Eliminar movimiento"
        isConfirming={deletingTransactionId !== null}
        onCancel={() => {
          if (deletingTransactionId === null) setTransactionPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />

      {successMessage && <Toast message={successMessage} onDismiss={() => setSuccessMessage(null)} />}
    </>
  );
}
