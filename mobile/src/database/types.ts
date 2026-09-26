import type {
  FinancialAccountPurpose,
  FinancialAccountSnapshotSource,
  FinancialAccountType,
} from '@smart-expense-ai/api-contracts';

export type LocalSyncStatus = 'synced' | 'pending' | 'conflict' | 'failed';

export interface LocalCategoryRow {
  id: string;
  name: string;
  normalized_name: string;
  transaction_type: 'expense' | 'income';
  system_category: 0 | 1;
  archived: 0 | 1;
  server_version: number | null;
  sync_status: LocalSyncStatus;
  created_at: string;
  updated_at: string;
}

export interface LocalTransactionRow {
  id: string;
  merchant: string;
  description: string;
  category_id: string;
  category_name: string;
  amount_minor: number;
  currency: string;
  transaction_date: string;
  transaction_type: 'expense' | 'income';
  payment_method: 'card' | 'cash' | 'bank_transfer' | 'direct_debit';
  is_recurring: 0 | 1;
  source: 'manual' | 'import' | 'bank_api';
  server_version: number | null;
  sync_status: LocalSyncStatus;
  created_at: string;
  updated_at: string;
}

export interface LocalBudgetRow {
  id: string;
  category_id: string | null;
  month: string;
  limit_minor: number;
  server_version: number | null;
  sync_status: LocalSyncStatus;
  created_at: string;
  updated_at: string;
}

export interface LocalFinancialAccountRow {
  id: string;
  name: string;
  institution: string | null;
  account_type: FinancialAccountType;
  purpose: FinancialAccountPurpose;
  current_balance_minor: number;
  currency: 'EUR';
  include_in_net_worth: 0 | 1;
  archived: 0 | 1;
  balance_updated_at: string;
  server_version: number | null;
  sync_status: LocalSyncStatus;
  created_at: string;
  updated_at: string;
}

export interface LocalFinancialAccountSnapshotRow {
  id: string;
  financial_account_id: string;
  balance_minor: number;
  include_in_net_worth: 0 | 1;
  archived: 0 | 1;
  recorded_at: string;
  source: FinancialAccountSnapshotSource;
  pending: 0 | 1;
}
