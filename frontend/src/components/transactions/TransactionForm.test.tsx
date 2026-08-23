import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionCategory, TransactionFormValues } from '../../types/transactions';
import { TransactionForm } from './TransactionForm';


const categories: TransactionCategory[] = [
  { id: 'food', name: 'Food', transactionType: 'expense' },
  { id: 'shopping', name: 'Shopping', transactionType: 'expense' },
];

const values: TransactionFormValues = {
  merchant: '',
  description: '',
  category: 'Food',
  amount: '',
  date: '2026-08-24',
  type: 'expense',
  paymentMethod: 'card',
  isRecurring: false,
};


describe('TransactionForm', () => {
  it('emits user changes and submits the form', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    render(
      <TransactionForm
        categories={categories}
        values={values}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Merchant'), {
      target: { value: 'Local Market' },
    });

    expect(onChange).toHaveBeenCalledWith({ ...values, merchant: 'Local Market' });
    expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('prevents duplicate submits while a request is in flight', () => {
    const onSubmit = vi.fn();

    render(
      <TransactionForm
        categories={categories}
        values={values}
        isSubmitting
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    const submitButton = screen.getByRole('button', { name: 'Saving...' });
    expect(submitButton).toBeDisabled();

    fireEvent.click(submitButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
