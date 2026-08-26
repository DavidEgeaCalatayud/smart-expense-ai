import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DetailedTransaction } from '../../types/transactions';
import { TransactionsTable } from './TransactionsTable';


const transaction: DetailedTransaction = {
  id: '11111111-1111-4111-8111-111111111111',
  merchant: 'Test Market',
  description: 'Weekly groceries',
  category: 'Food',
  amount: '64.35',
  date: '2026-08-24',
  type: 'expense',
  paymentMethod: 'card',
  status: 'normal',
  isRecurring: true,
};


describe('TransactionsTable', () => {
  it('renders the same transaction capability in mobile cards and the desktop table', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <TransactionsTable
        transactions={[transaction]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    const cards = screen.getByTestId('transaction-cards');
    const table = screen.getByTestId('transaction-table');

    expect(cards).toHaveClass('lg:hidden');
    expect(table).toHaveClass('hidden', 'lg:block');

    expect(within(cards).getByText('Test Market')).toBeInTheDocument();
    expect(within(cards).getByText('Food')).toBeInTheDocument();
    expect(within(cards).getByText('2026-08-24')).toBeInTheDocument();
    expect(within(cards).getByText('Card')).toBeInTheDocument();
    expect(within(cards).getByText('expense')).toBeInTheDocument();
    expect(within(cards).getByText('Normal')).toBeInTheDocument();
    expect(within(cards).getByText('Recurring')).toBeInTheDocument();
    expect(within(cards).getByText(/€64\.35/)).toBeInTheDocument();

    expect(within(table).getByText('Test Market')).toBeInTheDocument();
    expect(within(table).getByText('Food')).toBeInTheDocument();
    expect(within(table).getByText('2026-08-24')).toBeInTheDocument();
    expect(within(table).getByText('Card')).toBeInTheDocument();
    expect(within(table).getByText('expense')).toBeInTheDocument();
    expect(within(table).getByText('Normal')).toBeInTheDocument();
    expect(within(table).getByText(/€64\.35/)).toBeInTheDocument();

    fireEvent.click(within(cards).getByRole('button', { name: 'Edit Test Market' }));
    expect(onEdit).toHaveBeenCalledWith(transaction);

    fireEvent.click(within(table).getByRole('button', { name: 'Delete Test Market' }));
    expect(onDelete).toHaveBeenCalledWith(transaction.id);
  });

  it('shows one explicit empty state instead of duplicating responsive representations', () => {
    render(
      <TransactionsTable transactions={[]} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByTestId('transactions-empty-state')).toBeInTheDocument();
    expect(screen.getAllByText('No transactions match the current filters.')).toHaveLength(1);
    expect(screen.queryByTestId('transaction-cards')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transaction-table')).not.toBeInTheDocument();
  });
});
