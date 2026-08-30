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
    });
  });
});
