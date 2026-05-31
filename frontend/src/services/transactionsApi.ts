import type { DetailedTransaction, TransactionFormValues } from '../types/transactions';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const TRANSACTIONS_ENDPOINT = `${API_BASE_URL}/api/transactions`;

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

export async function fetchTransactions(): Promise<DetailedTransaction[]> {
  const response = await fetch(TRANSACTIONS_ENDPOINT);

  if (!response.ok) {
    throw new Error('Unable to fetch transactions');
  }

  return response.json();
}

export async function createTransaction(values: TransactionFormValues): Promise<DetailedTransaction> {
  const response = await fetch(TRANSACTIONS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mapFormValuesToPayload(values)),
  });

  if (!response.ok) {
    throw new Error('Unable to create transaction');
  }

  return response.json();
}

export async function updateTransaction(
  transactionId: string,
  values: TransactionFormValues,
): Promise<DetailedTransaction> {
  const response = await fetch(`${TRANSACTIONS_ENDPOINT}/${transactionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mapFormValuesToPayload(values)),
  });

  if (!response.ok) {
    throw new Error('Unable to update transaction');
  }

  return response.json();
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const response = await fetch(`${TRANSACTIONS_ENDPOINT}/${transactionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Unable to delete transaction');
  }
}
