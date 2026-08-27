export type TransactionType = 'expense' | 'income';
export type TransactionStatus = 'normal' | 'review';
export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'direct_debit';
export type TransactionSort = 'newest' | 'oldest' | 'amount_high' | 'amount_low';
export type MoneyAmount = string;

export interface TransactionCategory {
  id: string;
  name: string;
  transactionType: TransactionType;
  scope?: 'system' | 'user';
  archived?: boolean;
  transactionCount?: number;
}

export interface CategorySuggestionPreview {
  categoryId: string;
  categoryName: string;
  source: 'user_history' | 'global_model';
  modelVersion: string;
  featurePolicy: string;
}

export interface DetailedTransaction {
  id: string;
  merchant: string;
  description: string;
  category: string;
  amount: MoneyAmount;
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
  totalIncome: MoneyAmount;
  totalExpenses: MoneyAmount;
  balance: MoneyAmount;
  recurringCount: number;
  reviewCount: number;
  transactionCount: number;
}

export interface MonthlyExpensePoint {
  month: string;
  amount: MoneyAmount;
}
