import { decimalToMinorUnits, minorUnitsToDecimal } from '@smart-expense-ai/domain-types';

export interface OfflineTransactionFormInput {
  merchant: string;
  categoryName: string;
  amount: string;
  transactionDate: string;
}

export interface ValidatedOfflineTransactionInput {
  merchant: string;
  categoryName: string;
  normalizedCategoryName: string;
  amountDecimal: string;
  amountMinor: number;
  transactionDate: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!ISO_DATE_PATTERN.test(input.transactionDate)) {
    throw new Error('Date must use YYYY-MM-DD');
  }

  const amountDecimal = normalizeMoneyInput(input.amount);
  const amountMinor = decimalToMinorUnits(amountDecimal);

  return {
    merchant,
    categoryName,
    normalizedCategoryName: categoryName.toLocaleLowerCase(),
    amountDecimal,
    amountMinor,
    transactionDate: input.transactionDate,
  };
}
