import type {
  FinancialAccount,
  FinancialAccountDraft,
  FinancialAccountPurpose,
  FinancialAccountType,
  NetWorthHistory,
  NetWorthSummary,
} from '../types/financialAccounts';
import { apiFetch } from './apiClient';

export function fetchFinancialAccounts(): Promise<FinancialAccount[]> {
  return apiFetch<FinancialAccount[]>('/financial-accounts', {}, 'v2');
}

export function createFinancialAccount(payload: FinancialAccountDraft): Promise<FinancialAccount> {
  return apiFetch<FinancialAccount>('/financial-accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'v2');
}

export function updateFinancialAccount(
  accountId: string,
  payload: {
    name?: string;
    institution?: string | null;
    accountType?: FinancialAccountType;
    purpose?: FinancialAccountPurpose;
    includeInNetWorth?: boolean;
    archived?: boolean;
  },
): Promise<FinancialAccount> {
  return apiFetch<FinancialAccount>(`/financial-accounts/${accountId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'v2');
}

export function archiveFinancialAccount(accountId: string): Promise<void> {
  return apiFetch<void>(`/financial-accounts/${accountId}`, { method: 'DELETE' }, 'v2');
}

export function updateFinancialAccountBalance(accountId: string, balance: string): Promise<void> {
  return apiFetch<void>(`/financial-accounts/${accountId}/balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ balance }),
  }, 'v2');
}

export function fetchNetWorthSummary(): Promise<NetWorthSummary> {
  return apiFetch<NetWorthSummary>('/net-worth/summary', {}, 'v2');
}

export function fetchNetWorthHistory(months = 12): Promise<NetWorthHistory> {
  return apiFetch<NetWorthHistory>(`/net-worth/history?months=${months}`, {}, 'v2');
}
