import type {
  DetailedTransaction,
  TransactionFilters,
  TransactionFormValues,
  TransactionPage,
} from '../types/transactions';
import { apiFetch } from './apiClient';

export interface FetchTransactionsOptions {
  page?: number;
  pageSize?: number;
  filters?: TransactionFilters;
}

const mapFormValuesToPayload = (values: TransactionFormValues) => ({
  merchant: values.merchant,
  description: values.description,
  category: values.category,
  amount: Number(values.amount),
  date: values.date,
  type: values.type,
  paymentMethod: values.paymentMethod,
  isRecurring: values.isRecurring,
});

const buildQuery = ({ page = 1, pageSize = 20, filters }: FetchTransactionsOptions): string => {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });

  if (filters) {
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.category !== 'all') params.set('category', filters.category);
    if (filters.status !== 'all') params.set('status', filters.status);
    if (filters.type !== 'all') params.set('type', filters.type);
    if (filters.recurring !== 'all') params.set('recurring', filters.recurring);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    params.set('sort', filters.sort);
  }

  return params.toString();
};

export function fetchTransactions(options: FetchTransactionsOptions = {}): Promise<TransactionPage> {
  return apiFetch<TransactionPage>(`/transactions?${buildQuery(options)}`);
}

export function createTransaction(values: TransactionFormValues): Promise<DetailedTransaction> {
  return apiFetch<DetailedTransaction>('/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapFormValuesToPayload(values)),
  });
}

export function updateTransaction(
  transactionId: string,
  values: TransactionFormValues,
): Promise<DetailedTransaction> {
  return apiFetch<DetailedTransaction>(`/transactions/${transactionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mapFormValuesToPayload(values)),
  });
}

export function deleteTransaction(transactionId: string): Promise<void> {
  return apiFetch<void>(`/transactions/${transactionId}`, { method: 'DELETE' });
}
