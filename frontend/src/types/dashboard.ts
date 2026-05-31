export type TransactionStatus = 'normal' | 'review' | 'anomaly';

export interface MonthlyExpense {
  month: string;
  amount: number;
}

export interface Transaction {
  id: string;
  merchant: string;
  category: string;
  amount: number;
  date: string;
  status: TransactionStatus;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}
