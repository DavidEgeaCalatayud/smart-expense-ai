import { describe, expect, it } from 'vitest';
import {
  formatMoneyRounded,
  formatMoneyWithDecimals,
  isNegativeMoney,
  moneyToCents,
  normalizeMoneyAmount,
} from './money';

describe('fixed-point money helpers', () => {
  it('normalizes decimal strings without going through floating point', () => {
    expect(normalizeMoneyAmount('0.1')).toBe('0.10');
    expect(normalizeMoneyAmount('42')).toBe('42.00');
    expect(normalizeMoneyAmount('1234567890.99')).toBe('1234567890.99');
  });

  it('adds decimal money exactly as integer cents', () => {
    const total = moneyToCents('0.10') + moneyToCents('0.20');
    expect(total).toBe(30);
  });

  it('formats exact cents and negative balances', () => {
    expect(formatMoneyWithDecimals('1234567.05')).toBe('€1,234,567.05');
    expect(formatMoneyWithDecimals('-0.30')).toBe('-€0.30');
    expect(formatMoneyRounded('12.50')).toBe('€13');
    expect(isNegativeMoney('-0.01')).toBe(true);
  });

  it('rejects more than two decimal places', () => {
    expect(() => normalizeMoneyAmount('10.001')).toThrow(/two decimal places/i);
  });
});
