export type TransactionType = 'expense' | 'income';
export type TransactionStatus = 'normal' | 'review';
export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'direct_debit';
export type TransactionSort = 'newest' | 'oldest' | 'amount_high' | 'amount_low';

export interface TransactionCategory {
  id: string;
  name: string;
  transactionType: TransactionType;
}

export interface DetailedTransaction {
  id: string;
  merchant: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  isRecurring: boolean;
}

export interface TransactionFormValues {
  merchant: string;
  description: string;
  category: string;
  amount: string;
  date: string;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  isRecurring: boolean;
}

export interface TransactionFilters {
  search: string;
  category: string;
  status: 'all' | TransactionStatus;
  type: 'all' | TransactionType;
  recurring: 'all' | 'true' | 'false';
  dateFrom: string;
  dateTo: string;
  sort: TransactionSort;
}

export interface TransactionPage {
  items: DetailedTransaction[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface TransactionSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  recurringCount: number;
  reviewCount: number;
  transactionCount: number;
}

export interface MonthlyExpensePoint {
  month: string;
  amount: number;
}
