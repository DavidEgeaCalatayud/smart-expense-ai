import type { MoneyAmount } from '../types/transactions';
import { formatMoneyRounded, formatMoneyWithDecimals } from './money';

export const formatCurrency = (value: MoneyAmount) => formatMoneyRounded(value);

export const formatCurrencyWithDecimals = (value: MoneyAmount) => formatMoneyWithDecimals(value);
