import {
  normalizeMoneyInput,
  validateOfflineTransactionInput,
} from '../src/features/transactions/validation';

describe('offline transaction validation', () => {
  it('accepts Spanish comma input without floating-point arithmetic', () => {
    expect(normalizeMoneyInput('21,35')).toBe('21.35');
  });

  it('canonicalizes one-decimal API-compatible money', () => {
    expect(normalizeMoneyInput('0.1')).toBe('0.10');
  });

  it('rejects zero and malformed amounts', () => {
    expect(() => normalizeMoneyInput('0')).toThrow('greater than zero');
    expect(() => normalizeMoneyInput('1.234')).toThrow();
  });

  it('normalizes merchant/category and validates an ISO date', () => {
    expect(
      validateOfflineTransactionInput({
        merchant: '  Mercadona ',
        categoryName: ' Food ',
        amount: '32.48',
        transactionDate: '2026-08-30',
      }),
    ).toEqual({
      merchant: 'Mercadona',
      categoryName: 'Food',
      normalizedCategoryName: 'food',
      amountDecimal: '32.48',
      amountMinor: 3248,
      transactionDate: '2026-08-30',
      transactionType: 'expense', paymentMethod: 'card', description: '', isRecurring: false,
    });
  });
});

it.each(['2026-02-29', '2026-04-31', '2026-13-01', 'not-a-date'])('rejects nonexistent calendar date %s', (transactionDate) => {
  expect(() => validateOfflineTransactionInput({ merchant: 'Shop', categoryName: 'Food', amount: '1.00', transactionDate })).toThrow('valid date');
});
it('preserves income, payment method, recurrence and description', () => {
  expect(validateOfflineTransactionInput({ merchant: ' Employer ', categoryName: 'Salary', categoryId: 'salary', amount: '2400,05', transactionDate: '2028-02-29', transactionType: 'income', paymentMethod: 'bank_transfer', isRecurring: true, description: ' Monthly salary ' }))
    .toMatchObject({ amountMinor: 240005, transactionType: 'income', paymentMethod: 'bank_transfer', isRecurring: true, description: 'Monthly salary', categoryId: 'salary' });
});
