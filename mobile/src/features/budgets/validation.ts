import { decimalToMinorUnits } from '@smart-expense-ai/domain-types';

export function validateBudgetMonth(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error('Month must use YYYY-MM');
  }

  const [yearText, monthText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Month must use a valid YYYY-MM value');
  }

  return `${yearText}-${monthText}`;
}

export function validateBudgetLimitAmount(value: string): number {
  const minorUnits = decimalToMinorUnits(value.replace(',', '.'));
  if (minorUnits <= 0) {
    throw new Error('Budget limit must be greater than zero');
  }
  return minorUnits;
}

export function budgetMonthForSync(month: string): string {
  return `${validateBudgetMonth(month)}-01`;
}
