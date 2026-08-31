import {
  budgetMonthForSync,
  validateBudgetLimitAmount,
  validateBudgetMonth,
} from '../src/features/budgets/validation';

describe('offline budget validation', () => {
  it('accepts a valid local YYYY-MM value and builds the sync first-of-month date', () => {
    expect(validateBudgetMonth('2026-08')).toBe('2026-08');
    expect(budgetMonthForSync('2026-08')).toBe('2026-08-01');
  });

  it('rejects malformed or impossible months before they reach the outbox', () => {
    expect(() => validateBudgetMonth('2026-8')).toThrow('YYYY-MM');
    expect(() => validateBudgetMonth('2026-13')).toThrow('valid YYYY-MM');
    expect(() => validateBudgetMonth('2026-00')).toThrow('valid YYYY-MM');
  });

  it('converts exact decimal-string limits to integer minor units', () => {
    expect(validateBudgetLimitAmount('400.00')).toBe(40000);
    expect(validateBudgetLimitAmount('21,35')).toBe(2135);
  });

  it('rejects zero, negative and over-precision limits locally', () => {
    expect(() => validateBudgetLimitAmount('0')).toThrow('greater than zero');
    expect(() => validateBudgetLimitAmount('-1.00')).toThrow('greater than zero');
    expect(() => validateBudgetLimitAmount('10.001')).toThrow();
  });
});
