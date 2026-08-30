import { decimalToMinorUnits, minorUnitsToDecimal } from '@smart-expense-ai/domain-types';

describe('shared exact-money contract', () => {
  it('preserves exact cents', () => {
    expect(decimalToMinorUnits('0.10') + decimalToMinorUnits('0.20')).toBe(30);
    expect(minorUnitsToDecimal(30)).toBe('0.30');
  });

  it('rejects more than two decimal places', () => {
    expect(() => decimalToMinorUnits('10.001')).toThrow();
  });
});
