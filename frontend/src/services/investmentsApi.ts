import { apiFetch } from './apiClient';
import type {
  InvestmentMovementType,
  InvestmentPortfolio,
  InvestmentPortfolioHistory,
  InvestmentPosition,
  InvestmentRange,
  NavRefreshResponse,
} from '../types/investments';

export function fetchInvestmentPortfolios(): Promise<InvestmentPortfolio[]> {
  return apiFetch<InvestmentPortfolio[]>('/investments/portfolios', {}, 'v2');
}

export function createInvestmentPosition(payload: {
  financialAccountId: string;
  name: string;
  isin: string;
  units: string;
  costTotal: string;
  currency: 'EUR';
}): Promise<InvestmentPosition> {
  return apiFetch<InvestmentPosition>('/investments/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'v2');
}

export function updateInvestmentHoldings(
  positionId: string,
  payload: {
    units: string;
    costTotal: string;
    movementType: InvestmentMovementType;
    note?: string | null;
  },
): Promise<InvestmentPosition> {
  return apiFetch<InvestmentPosition>(`/investments/positions/${positionId}/holdings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'v2');
}

export function refreshInvestmentNavs(force = false): Promise<NavRefreshResponse> {
  return apiFetch<NavRefreshResponse>(`/investments/nav/refresh?force=${force ? 'true' : 'false'}`, {
    method: 'POST',
  }, 'v2');
}

export function fetchInvestmentHistory(
  accountId: string,
  range: InvestmentRange,
): Promise<InvestmentPortfolioHistory> {
  return apiFetch<InvestmentPortfolioHistory>(
    `/investments/portfolios/${accountId}/history?range=${range}`,
    {},
    'v2',
  );
}
