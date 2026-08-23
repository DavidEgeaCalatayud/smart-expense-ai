import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCategories } from '../services/categoriesApi';
import {
  createTransaction,
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
} from '../services/transactionsApi';
import type { DetailedTransaction, TransactionCategory } from '../types/transactions';
import { TransactionsPage } from './TransactionsPage';


vi.mock('../services/categoriesApi', () => ({
  fetchCategories: vi.fn(),
}));

vi.mock('../services/transactionsApi', () => ({
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  fetchTransactions: vi.fn(),
  updateTransaction: vi.fn(),
}));

const categories: TransactionCategory[] = [
  { id: 'food', name: 'Food', transactionType: 'expense' },
  { id: 'salary', name: 'Salary', transactionType: 'income' },
];

const persistedTransaction: DetailedTransaction = {
  id: '11111111-1111-4111-8111-111111111111',
  merchant: 'Persisted Market',
  description: 'Loaded from API',
  category: 'Food',
  amount: 25,
  date: '2026-08-24',
  type: 'expense',
  paymentMethod: 'card',
  status: 'normal',
  isRecurring: false,
};


describe('TransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCategories).mockResolvedValue(categories);
    vi.mocked(fetchTransactions).mockResolvedValue([persistedTransaction]);
    vi.mocked(deleteTransaction).mockResolvedValue();
    vi.mocked(updateTransaction).mockResolvedValue(persistedTransaction);
  });

  it('loads transactions and categories from the API', async () => {
    render(<TransactionsPage />);

    expect(await screen.findByText('Persisted Market')).toBeInTheDocument();
    expect(fetchTransactions).toHaveBeenCalledOnce();
    expect(fetchCategories).toHaveBeenCalledOnce();
    expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument();
  });

  it('creates a transaction through the API before adding it to the table', async () => {
    const createdTransaction: DetailedTransaction = {
      ...persistedTransaction,
      id: '22222222-2222-4222-8222-222222222222',
      merchant: 'New Market',
      amount: 40,
    };
    vi.mocked(createTransaction).mockResolvedValue(createdTransaction);

    render(<TransactionsPage />);
    await screen.findByText('Persisted Market');

    fireEvent.change(screen.getByLabelText('Merchant'), {
      target: { value: 'New Market' },
    });
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '40' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          merchant: 'New Market',
          amount: '40',
          category: 'Food',
          type: 'expense',
        }),
      ),
    );
    expect(await screen.findByText('New Market')).toBeInTheDocument();
  });
});
