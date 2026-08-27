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
    const validValues: TransactionFormValues = {
      ...values,
      merchant: 'Initial Market',
      amount: '10',
    };

    render(
      <TransactionForm
        categories={categories}
        values={validValues}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Merchant'), {
      target: { value: 'Local Market' },
    });

    expect(onChange).toHaveBeenCalledWith({ ...validValues, merchant: 'Local Market' });
    expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('shows a suggestion as an explicit accept-or-change choice without confidence', () => {
    const onAcceptSuggestion = vi.fn();
    const onDismissSuggestion = vi.fn();

    render(
      <TransactionForm
        categories={categories}
        values={{ ...values, merchant: 'Amazon' }}
        suggestion={{
          categoryId: 'shopping',
          categoryName: 'Shopping',
          source: 'global_model',
          modelVersion: 'tfidf-logreg-v1',
          featurePolicy: 'merchant_descriptor_only_v1',
        }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onRequestSuggestion={vi.fn()}
        onAcceptSuggestion={onAcceptSuggestion}
        onDismissSuggestion={onDismissSuggestion}
      />,
    );

    const suggestion = screen.getByRole('region', { name: 'AI category suggestion' });
    expect(suggestion).toHaveTextContent('Suggested category');
    expect(suggestion).toHaveTextContent('Shopping');
    expect(suggestion).not.toHaveTextContent('%');
    expect(suggestion).not.toHaveTextContent(/confidence/i);

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAcceptSuggestion).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onDismissSuggestion).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Category')).toHaveFocus();
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
