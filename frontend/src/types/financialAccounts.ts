export type FinancialAccountType =
  | 'checking'
  | 'savings'
  | 'broker'
  | 'wallet'
  | 'cash'
  | 'other';

export type FinancialAccountPurpose =
  | 'daily'
  | 'savings'
  | 'emergency_fund'
  | 'opportunities'
  | 'investment'
  | 'other';

export interface FinancialAccount {
  id: string;
  name: string;
  institution: string | null;
  accountType: FinancialAccountType;
  purpose: FinancialAccountPurpose;
  currentBalance: string;
  currency: 'EUR';
  includeInNetWorth: boolean;
  archived: boolean;
  balanceUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface NetWorthSummary {
  totalNetWorth: string;
  available: string;
  reserved: string;
  invested: string;
  daily: string;
  savings: string;
  emergencyFund: string;
  opportunities: string;
  investment: string;
  other: string;
  currency: 'EUR';
}

export interface NetWorthHistoryPoint {
  recordedAt: string;
  totalNetWorth: string;
}

export interface NetWorthHistory {
  months: number;
  points: NetWorthHistoryPoint[];
  changeAmount: string;
  changePercent: string | null;
  currency: 'EUR';
}

export interface FinancialAccountDraft {
  name: string;
  institution: string;
  accountType: FinancialAccountType;
  purpose: FinancialAccountPurpose;
  currentBalance: string;
  currency: 'EUR';
  includeInNetWorth: boolean;
}
