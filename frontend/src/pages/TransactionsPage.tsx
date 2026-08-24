import { Download, ReceiptText, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard } from '../components/dashboard/MetricCard';
import { PageHeader } from '../components/layout/PageHeader';
import { PaginationControls } from '../components/transactions/PaginationControls';
import { TransactionFilters } from '../components/transactions/TransactionFilters';
import { TransactionForm } from '../components/transactions/TransactionForm';
import { TransactionsTable } from '../components/transactions/TransactionsTable';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Toast } from '../components/ui/Toast';
import { getApiErrorMessage } from '../services/apiClient';
import { fetchTransactionSummary } from '../services/analyticsApi';
import { fetchCategories } from '../services/categoriesApi';
import {
  createTransaction,
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
} from '../services/transactionsApi';
import type {
  DetailedTransaction,
  TransactionCategory,
  TransactionFilters as TransactionFiltersType,
  TransactionFormValues,
  TransactionPage,
  TransactionSummary,
} from '../types/transactions';
import { formatCurrency, formatCurrencyWithDecimals } from '../utils/formatters';

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
  const [filters, setFilters] = useState<TransactionFiltersType>(defaultFilters);
  const [queryFilters, setQueryFilters] = useState<TransactionFiltersType>(defaultFilters);
  const [page, setPage] = useState(1);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [transactionPendingDelete, setTransactionPendingDelete] = useState<DetailedTransaction | null>(null);
  const [hasLoadedPage, setHasLoadedPage] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    setIsPageLoading(true);
    try {
      const loadedPage = await fetchTransactions({ page, pageSize: PAGE_SIZE, filters: queryFilters });
      setPageData(loadedPage);
      setError(null);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Unable to load transactions'));
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
      setError(getApiErrorMessage(loadError, 'Unable to load transaction summary'));
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
        const defaultExpenseCategory =
          loadedCategories.find((category) => category.transactionType === 'expense')?.name ??
          loadedCategories[0]?.name ??
          '';
        setFormValues(buildDefaultFormValues(defaultExpenseCategory));
      } catch (loadError) {
        if (isActive) setError(getApiErrorMessage(loadError, 'Unable to load categories'));
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

    setFormValues({
      ...nextValues,
      category: categoryIsCompatible ? nextValues.category : compatibleCategories[0]?.name ?? '',
    });
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
      if (editingTransactionId) {
        await updateTransaction(editingTransactionId, formValues);
      } else {
        await createTransaction(formValues);
      }

      setEditingTransactionId(null);
      setFormValues(buildDefaultFormValues(defaultExpenseCategory));
      await refreshPageAndSummary();
      setSuccessMessage(isEditing ? 'Transaction updated successfully.' : 'Transaction created successfully.');
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, 'Unable to save transaction'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditTransaction = (transaction: DetailedTransaction) => {
    setError(null);
    setSuccessMessage(null);
    setEditingTransactionId(transaction.id);
    setFormValues(mapTransactionToFormValues(transaction));
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
        setFormValues(buildDefaultFormValues(defaultExpenseCategory));
      }

      if (pageData.items.length === 1 && page > 1) {
        setPage((currentPage) => currentPage - 1);
        await loadSummary();
      } else {
        await refreshPageAndSummary();
      }
      setSuccessMessage('Transaction deleted successfully.');
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, 'Unable to delete transaction'));
    } finally {
      setDeletingTransactionId(null);
      setTransactionPendingDelete(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingTransactionId(null);
    setFormValues(buildDefaultFormValues(defaultExpenseCategory));
  };

  const isRefreshing = hasLoadedPage && isPageLoading;
  const emptyMessage =
    summary.transactionCount === 0
      ? 'Create your first transaction with the form to start building your financial history.'
      : 'No transactions match the current server-side filters. Try changing or clearing them.';

  return (
    <>
      <PageHeader
        eyebrow="Transaction management"
        title="Transactions"
        description="Paginated, filtered and persisted financial movements served by the decimal-safe API v2 money contract."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshPageAndSummary()}
              disabled={isPageLoading || isSummaryLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={17} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              disabled
              title="CSV import is not available yet"
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-400 opacity-70 shadow-sm"
            >
              <Download size={18} />
              Import CSV
            </button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void refreshPageAndSummary()}
            className="self-start rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold transition hover:bg-rose-100 sm:self-auto"
          >
            Retry
          </button>
        </div>
      )}

      <section className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total expenses" value={formatCurrency(summary.totalExpenses)} detail="All persisted expenses" trend="up" icon={<ReceiptText size={20} />} />
        <MetricCard title="Total income" value={formatCurrency(summary.totalIncome)} detail="All persisted income" trend="down" icon={<ReceiptText size={20} />} />
        <MetricCard title="Recurring items" value={String(summary.recurringCount)} detail="Recurring movements" trend="neutral" icon={<ReceiptText size={20} />} />
        <MetricCard title="Needs review" value={String(summary.reviewCount)} detail="Rule-based review flags" trend="warning" icon={<ReceiptText size={20} />} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <TransactionForm
          categories={compatibleFormCategories}
          values={formValues}
          isEditing={editingTransactionId !== null}
          isSubmitting={isSubmitting || !hasLoadedPage || compatibleFormCategories.length === 0}
          onChange={handleFormChange}
          onSubmit={handleSubmitTransaction}
          onCancelEdit={handleCancelEdit}
        />

        <div className="space-y-6">
          <TransactionFilters categories={categories} filters={filters} onChange={setFilters} />

          {!hasLoadedPage ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-soft">
              Loading transactions and categories...
            </div>
          ) : (
            <div className="space-y-3" aria-busy={isPageLoading}>
              {isRefreshing && (
                <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700">
                  Refreshing results from the API…
                </div>
              )}
              <TransactionsTable
                transactions={pageData.items}
                emptyMessage={emptyMessage}
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
        title="Delete transaction?"
        description={
          transactionPendingDelete
            ? `${transactionPendingDelete.merchant} · ${formatCurrencyWithDecimals(transactionPendingDelete.amount)} will be permanently removed.`
            : ''
        }
        confirmLabel="Delete transaction"
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
