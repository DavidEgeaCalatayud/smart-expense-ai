export type TransactionType = 'expense' | 'income';
export type TransactionStatus = 'normal' | 'review' | 'anomaly';
export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'direct_debit';

export interface TransactionCategory {
  id: string;
  name: string;
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
  aiConfidence: number;
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
  status: string;
  type: string;
}
