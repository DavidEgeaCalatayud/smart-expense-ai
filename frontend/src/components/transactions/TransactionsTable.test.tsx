import { fireEvent, render, screen } from '@testing-library/react';
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
  isRecurring: false,
};


describe('TransactionsTable', () => {
  it('renders persisted transaction data and exposes row actions', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <TransactionsTable
        transactions={[transaction]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText('Test Market')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText(/€64\.35/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Test Market' }));
    expect(onEdit).toHaveBeenCalledWith(transaction);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Test Market' }));
    expect(onDelete).toHaveBeenCalledWith(transaction.id);
  });

  it('shows an explicit empty state when no rows match', () => {
    render(
      <TransactionsTable transactions={[]} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByText('No transactions match the current filters.')).toBeInTheDocument();
  });
});
