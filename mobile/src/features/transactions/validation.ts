import { decimalToMinorUnits, minorUnitsToDecimal } from '@smart-expense-ai/domain-types';

export interface OfflineTransactionFormInput {
  merchant: string;
  categoryName: string;
  amount: string;
  transactionDate: string;
  categoryId?: string;
  transactionType?: 'expense' | 'income';
  paymentMethod?: 'card' | 'cash' | 'bank_transfer' | 'direct_debit';
  description?: string;
  isRecurring?: boolean;
}

export interface ValidatedOfflineTransactionInput {
  merchant: string;
  categoryName: string;
  normalizedCategoryName: string;
  amountDecimal: string;
  amountMinor: number;
  transactionDate: string;
  categoryId?: string;
  transactionType: 'expense' | 'income';
  paymentMethod: 'card' | 'cash' | 'bank_transfer' | 'direct_debit';
  description: string;
  isRecurring: boolean;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function normalizeMoneyInput(value: string): string {
  const normalized = value.trim().replace(',', '.');
  const minor = decimalToMinorUnits(normalized);
  if (minor <= 0) {
    throw new Error('Amount must be greater than zero');
  }
  return minorUnitsToDecimal(minor);
}

export function validateOfflineTransactionInput(
  input: OfflineTransactionFormInput,
): ValidatedOfflineTransactionInput {
  const merchant = input.merchant.trim();
  const categoryName = input.categoryName.trim();

  if (merchant.length < 1 || merchant.length > 120) {
    throw new Error('Merchant must contain between 1 and 120 characters');
  }
  if (categoryName.length < 1 || categoryName.length > 80) {
    throw new Error('Category must contain between 1 and 80 characters');
  }
  if (!isCalendarDate(input.transactionDate)) {
    throw new Error('Choose a valid date (YYYY-MM-DD)');
  }

  const transactionType = input.transactionType ?? 'expense';
  const paymentMethod = input.paymentMethod ?? 'card';
  const description = (input.description ?? '').trim();
  if (!['expense', 'income'].includes(transactionType)) throw new Error('Choose income or expense');
  if (!['card', 'cash', 'bank_transfer', 'direct_debit'].includes(paymentMethod)) throw new Error('Choose a payment method');
  if (description.length > 500) throw new Error('Description must contain at most 500 characters');

  const amountDecimal = normalizeMoneyInput(input.amount);
  const amountMinor = decimalToMinorUnits(amountDecimal);

  return {
    merchant,
    categoryName,
    normalizedCategoryName: categoryName.toLocaleLowerCase(),
    amountDecimal,
    amountMinor,
    transactionDate: input.transactionDate,
    categoryId: input.categoryId,
    transactionType,
    paymentMethod,
    description,
    isRecurring: input.isRecurring ?? false,
  };
}
