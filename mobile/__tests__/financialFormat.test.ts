import { money, expenseChange } from '../src/features/home/financialFormat';
it('formats decimal cents exactly even for totals above the floating point safe range', () => {
  expect(money('9007199254740993.91').replace(/[^0-9]/g, '')).toBe('900719925474099391');
  expect(money('-0.01')).toContain('-');
  expect(money('12.3').replace(/[^0-9]/g, '')).toBe('1230');
});
it('compares monthly spending without manufacturing a percentage over a zero baseline', () => {
  expect(expenseChange('108.20', '100.00')).toBe('+8.2%');
  expect(expenseChange('91.80', '100.00')).toBe('−8.2%');
  expect(expenseChange('100.00', '0.00')).toBeNull();
});
