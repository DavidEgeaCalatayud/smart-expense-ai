import { Download, ReceiptText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MetricCard } from '../components/dashboard/MetricCard';
import { PageHeader } from '../components/layout/PageHeader';
import { TransactionFilters } from '../components/transactions/TransactionFilters';
import { TransactionForm } from '../components/transactions/TransactionForm';
import { TransactionsTable } from '../components/transactions/TransactionsTable';
import { initialDetailedTransactions, transactionCategories } from '../data/transactionsData';
import type { DetailedTransaction, TransactionFilters as TransactionFiltersType, TransactionFormValues } from '../types/transactions';
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

const buildTransactionFromForm = (
  formValues: TransactionFormValues,
  existingTransaction?: DetailedTransaction,
): DetailedTransaction | null => {
  const amount = Number(formValues.amount);

  if (!formValues.merchant.trim() || Number.isNaN(amount) || amount <= 0) {
    return null;
  }

  return {
    id: existingTransaction?.id ?? `trx_${Date.now()}`,
    merchant: formValues.merchant.trim(),
    description: formValues.description.trim(),
    category: formValues.category,
    amount,
    date: formValues.date,
    type: formValues.type,
    paymentMethod: formValues.paymentMethod,
    status: existingTransaction?.status ?? (amount > 120 && formValues.type === 'expense' ? 'review' : 'normal'),
    aiConfidence: formValues.description.trim().length > 0 ? 84 : 68,
    isRecurring: formValues.isRecurring,
  };
};

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<DetailedTransaction[]>(initialDetailedTransactions);
  const [formValues, setFormValues] = useState<TransactionFormValues>(defaultFormValues);
  const [filters, setFilters] = useState<TransactionFiltersType>(defaultFilters);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

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
    () => transactions.filter((transaction) => transaction.type === 'expense').reduce((total, item) => total + item.amount, 0),
    [transactions],
  );

  const totalIncome = useMemo(
    () => transactions.filter((transaction) => transaction.type === 'income').reduce((total, item) => total + item.amount, 0),
    [transactions],
  );

  const anomalyCount = useMemo(
    () => transactions.filter((transaction) => transaction.status === 'anomaly').length,
    [transactions],
  );

  const recurringCount = useMemo(
    () => transactions.filter((transaction) => transaction.isRecurring).length,
    [transactions],
  );

  const handleSubmitTransaction = () => {
    const currentTransaction = transactions.find((transaction) => transaction.id === editingTransactionId);
    const transactionPayload = buildTransactionFromForm(formValues, currentTransaction);

    if (!transactionPayload) {
      return;
    }

    if (editingTransactionId) {
      setTransactions((currentTransactions) =>
        currentTransactions.map((transaction) =>
          transaction.id === editingTransactionId ? transactionPayload : transaction,
        ),
      );
    } else {
      setTransactions((currentTransactions) => [transactionPayload, ...currentTransactions]);
    }

    setEditingTransactionId(null);
    setFormValues(defaultFormValues);
  };

  const handleEditTransaction = (transaction: DetailedTransaction) => {
    setEditingTransactionId(transaction.id);
    setFormValues(mapTransactionToFormValues(transaction));
  };

  const handleDeleteTransaction = (transactionId: string) => {
    setTransactions((currentTransactions) => currentTransactions.filter((transaction) => transaction.id !== transactionId));

    if (editingTransactionId === transactionId) {
      setEditingTransactionId(null);
      setFormValues(defaultFormValues);
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
        description="Create, filter and review financial movements before sending them to the AI analysis engine."
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

      <section className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total expenses"
          value={formatCurrency(totalExpenses)}
          detail="Manual and detected expenses"
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
          value={String(anomalyCount)}
          detail="Detected anomalies"
          trend="warning"
          icon={<ReceiptText size={20} />}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
        <TransactionForm
          categories={transactionCategories}
          values={formValues}
          isEditing={editingTransactionId !== null}
          onChange={setFormValues}
          onSubmit={handleSubmitTransaction}
          onCancelEdit={handleCancelEdit}
        />

        <div className="space-y-6">
          <TransactionFilters categories={transactionCategories} filters={filters} onChange={setFilters} />
          <TransactionsTable
            transactions={filteredTransactions}
            onEdit={handleEditTransaction}
            onDelete={handleDeleteTransaction}
          />
        </div>
      </section>
    </>
  );
}
