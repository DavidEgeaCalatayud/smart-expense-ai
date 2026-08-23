import { Download, ReceiptText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MetricCard } from '../components/dashboard/MetricCard';
import { PageHeader } from '../components/layout/PageHeader';
import { TransactionFilters } from '../components/transactions/TransactionFilters';
import { TransactionForm } from '../components/transactions/TransactionForm';
import { TransactionsTable } from '../components/transactions/TransactionsTable';
import { transactionCategories } from '../data/transactionsData';
import {
  createTransaction,
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
} from '../services/transactionsApi';
import type {
  DetailedTransaction,
  TransactionFilters as TransactionFiltersType,
  TransactionFormValues,
} from '../types/transactions';
import { formatCurrency } from '../utils/formatters';

const defaultFormValues: TransactionFormValues = {
  merchant: '',
  description: '',
  category: 'Food',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  type: 'expense',
  paymentMethod: 'card',
  isRecurring: false,
};

const defaultFilters: TransactionFiltersType = {
  search: '',
  category: 'all',
  status: 'all',
  type: 'all',
};

const mapTransactionToFormValues = (transaction: DetailedTransaction): TransactionFormValues => ({
  merchant: transaction.merchant,
  description: transaction.description,
  category: transaction.category,
  amount: String(transaction.amount),
  date: transaction.date,
  type: transaction.type,
  paymentMethod: transaction.paymentMethod,
  isRecurring: transaction.isRecurring,
});

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<DetailedTransaction[]>([]);
  const [formValues, setFormValues] = useState<TransactionFormValues>(defaultFormValues);
  const [filters, setFilters] = useState<TransactionFiltersType>(defaultFilters);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadTransactions = async () => {
      try {
        const loadedTransactions = await fetchTransactions();

        if (isActive) {
          setTransactions(loadedTransactions);
        }
      } catch (loadError) {
        if (isActive) {
          setError(getErrorMessage(loadError, 'Unable to load transactions'));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadTransactions();

    return () => {
      isActive = false;
    };
  }, []);

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = filters.search.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        transaction.merchant.toLowerCase().includes(normalizedSearch) ||
        transaction.description.toLowerCase().includes(normalizedSearch);

      const matchesCategory = filters.category === 'all' || transaction.category === filters.category;
      const matchesStatus = filters.status === 'all' || transaction.status === filters.status;
      const matchesType = filters.type === 'all' || transaction.type === filters.type;

      return matchesSearch && matchesCategory && matchesStatus && matchesType;
    });
  }, [filters, transactions]);

  const totalExpenses = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.type === 'expense')
        .reduce((total, item) => total + item.amount, 0),
    [transactions],
  );

  const totalIncome = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.type === 'income')
        .reduce((total, item) => total + item.amount, 0),
    [transactions],
  );

  const needsReviewCount = useMemo(
    () => transactions.filter((transaction) => transaction.status !== 'normal').length,
    [transactions],
  );

  const recurringCount = useMemo(
    () => transactions.filter((transaction) => transaction.isRecurring).length,
    [transactions],
  );

  const handleSubmitTransaction = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      if (editingTransactionId) {
        const updatedTransaction = await updateTransaction(editingTransactionId, formValues);
        setTransactions((currentTransactions) =>
          currentTransactions.map((transaction) =>
            transaction.id === editingTransactionId ? updatedTransaction : transaction,
          ),
        );
      } else {
        const createdTransaction = await createTransaction(formValues);
        setTransactions((currentTransactions) => [createdTransaction, ...currentTransactions]);
      }

      setEditingTransactionId(null);
      setFormValues(defaultFormValues);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save transaction'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditTransaction = (transaction: DetailedTransaction) => {
    setError(null);
    setEditingTransactionId(transaction.id);
    setFormValues(mapTransactionToFormValues(transaction));
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    setError(null);
    setDeletingTransactionId(transactionId);

    try {
      await deleteTransaction(transactionId);
      setTransactions((currentTransactions) =>
        currentTransactions.filter((transaction) => transaction.id !== transactionId),
      );

      if (editingTransactionId === transactionId) {
        setEditingTransactionId(null);
        setFormValues(defaultFormValues);
      }
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete transaction'));
    } finally {
      setDeletingTransactionId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingTransactionId(null);
    setFormValues(defaultFormValues);
  };

  return (
    <>
      <PageHeader
        eyebrow="Transaction management"
        title="Transactions"
        description="Create, edit, filter and review persistent financial movements."
        action={
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Download size={18} />
            Import CSV
          </button>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
        >
          {error}
        </div>
      )}

      <section className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total expenses"
          value={formatCurrency(totalExpenses)}
          detail="Persisted expense transactions"
          trend="up"
          icon={<ReceiptText size={20} />}
        />
        <MetricCard
          title="Total income"
          value={formatCurrency(totalIncome)}
          detail="Current registered income"
          trend="down"
          icon={<ReceiptText size={20} />}
        />
        <MetricCard
          title="Recurring items"
          value={String(recurringCount)}
          detail="Subscriptions and repeated movements"
          trend="neutral"
          icon={<ReceiptText size={20} />}
        />
        <MetricCard
          title="Needs review"
          value={String(needsReviewCount)}
          detail="Transactions currently flagged for review"
          trend="warning"
          icon={<ReceiptText size={20} />}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <TransactionForm
          categories={transactionCategories}
          values={formValues}
          isEditing={editingTransactionId !== null}
          isSubmitting={isSubmitting || isLoading}
          onChange={setFormValues}
          onSubmit={handleSubmitTransaction}
          onCancelEdit={handleCancelEdit}
        />

        <div className="space-y-6">
          <TransactionFilters categories={transactionCategories} filters={filters} onChange={setFilters} />

          {isLoading ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-soft">
              Loading transactions...
            </div>
          ) : (
            <TransactionsTable
              transactions={filteredTransactions}
              onEdit={handleEditTransaction}
              onDelete={(transactionId) => {
                if (deletingTransactionId === null) {
                  void handleDeleteTransaction(transactionId);
                }
              }}
            />
          )}
        </div>
      </section>
    </>
  );
}
