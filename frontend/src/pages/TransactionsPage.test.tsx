import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  TransactionPage,
  TransactionSummary,
} from '../types/transactions';
import { TransactionsPage } from './TransactionsPage';

vi.mock('../services/analyticsApi', () => ({ fetchTransactionSummary: vi.fn() }));
vi.mock('../services/categoriesApi', () => ({ fetchCategories: vi.fn() }));
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
  amount: '25.00',
  date: '2026-08-24',
  type: 'expense',
  paymentMethod: 'card',
  status: 'normal',
  isRecurring: false,
};

const summary: TransactionSummary = {
  totalIncome: '100.00',
  totalExpenses: '25.00',
  balance: '75.00',
  recurringCount: 0,
  reviewCount: 0,
  transactionCount: 1,
};

const pageWith = (items: DetailedTransaction[], page = 1, total = items.length): TransactionPage => ({
  items,
  page,
  pageSize: 10,
  total,
  pages: total === 0 ? 0 : Math.ceil(total / 10),
});

async function getTransactionCards() {
  const cards = await screen.findByTestId('transaction-cards');
  expect(within(cards).getByText('Persisted Market')).toBeInTheDocument();
  return cards;
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCategories).mockResolvedValue(categories);
    vi.mocked(fetchTransactionSummary).mockResolvedValue(summary);
    vi.mocked(fetchTransactions).mockResolvedValue(pageWith([persistedTransaction]));
    vi.mocked(deleteTransaction).mockResolvedValue();
    vi.mocked(updateTransaction).mockResolvedValue(persistedTransaction);
  });

  it('loads a paginated transaction page, categories and server summary', async () => {
    render(<TransactionsPage />);

    await getTransactionCards();
    expect(fetchTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
    expect(fetchCategories).toHaveBeenCalledOnce();
    expect(fetchTransactionSummary).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('option', { name: 'Food' })).toHaveLength(2);
    expect(screen.getByText(/Showing/)).toHaveTextContent('1–1 of 1');
  });

  it('sends filters to the API instead of filtering the loaded page in memory', async () => {
    render(<TransactionsPage />);
    await getTransactionCards();

    fireEvent.change(screen.getByLabelText('Review status'), { target: { value: 'review' } });

    await waitFor(
      () =>
        expect(fetchTransactions).toHaveBeenLastCalledWith(
          expect.objectContaining({
            page: 1,
            filters: expect.objectContaining({ status: 'review' }),
          }),
        ),
      { timeout: 1500 },
    );
  });

  it('creates a transaction and refreshes the server page before reporting success', async () => {
    const createdTransaction: DetailedTransaction = {
      ...persistedTransaction,
      id: '22222222-2222-4222-8222-222222222222',
      merchant: 'New Market',
      amount: '40.00',
    };
    vi.mocked(createTransaction).mockResolvedValue(createdTransaction);
    vi.mocked(fetchTransactions)
      .mockResolvedValueOnce(pageWith([persistedTransaction]))
      .mockResolvedValue(pageWith([createdTransaction, persistedTransaction], 1, 2));

    render(<TransactionsPage />);
    await getTransactionCards();

    fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: 'New Market' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));

    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ merchant: 'New Market', amount: '40', category: 'Food' }),
      ),
    );
    await waitFor(() =>
      expect(within(screen.getByTestId('transaction-cards')).getByText('New Market')).toBeInTheDocument(),
    );
    expect(fetchTransactionSummary).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Transaction created successfully.');
  });

  it('requires confirmation before deleting and refreshes the current page', async () => {
    vi.mocked(fetchTransactions)
      .mockResolvedValueOnce(pageWith([persistedTransaction]))
      .mockResolvedValue(pageWith([]));

    render(<TransactionsPage />);
    const cards = await getTransactionCards();

    fireEvent.click(within(cards).getByRole('button', { name: 'Delete Persisted Market' }));
    expect(deleteTransaction).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Delete transaction?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteTransaction).not.toHaveBeenCalled();

    fireEvent.click(
      within(screen.getByTestId('transaction-cards')).getByRole('button', {
        name: 'Delete Persisted Market',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete transaction' }));

    await waitFor(() => expect(deleteTransaction).toHaveBeenCalledWith(persistedTransaction.id));
    expect(await screen.findByTestId('transactions-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('transaction-cards')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Transaction deleted successfully.');
  });
});
