import { getSharedMobileApiClient } from '../../api/client';

export type InvestmentRange = '1m' | '3m' | '1y' | 'all';
export type InvestmentMovementType = 'contribution' | 'sale' | 'transfer_in' | 'transfer_out' | 'adjustment';
export type InvestmentMovementRecordType = 'initial' | InvestmentMovementType;

export interface MobileInvestmentMovement {
  id: string;
  positionId: string;
  movementType: InvestmentMovementRecordType;
  unitsAfter: string;
  costTotalAfter: string;
  occurredAt: string;
  note: string | null;
}

export interface MobileInvestmentPosition {
  id: string;
  financialAccountId: string;
  name: string;
  isin: string;
  units: string;
  costTotal: string;
  currentValue: string;
  gainAmount: string;
  gainPercent: string | null;
  latestNav: string | null;
  navDate: string | null;
  navProvider: string | null;
  navSourceUrl: string | null;
  valueSource: 'nav' | 'cost_fallback';
  autoPricingAvailable: boolean;
  updatedAt: string;
}

export interface MobileInvestmentPortfolio {
  financialAccountId: string;
  name: string;
  institution: string | null;
  totalValue: string;
  totalCost: string;
  gainAmount: string;
  gainPercent: string | null;
  latestValuationDate: string | null;
  positions: MobileInvestmentPosition[];
}

export interface MobileInvestmentHistory {
  financialAccountId: string;
  range: InvestmentRange;
  points: { date: string; value: string; cost: string }[];
}

const client = getSharedMobileApiClient();

export function fetchInvestmentPortfolios(): Promise<MobileInvestmentPortfolio[]> {
  return client.request('/api/v2/investments/portfolios');
}

export function createInvestmentPosition(payload: {
  financialAccountId: string;
  name: string;
  isin: string;
  units: string;
  costTotal: string;
  currency: 'EUR';
}): Promise<MobileInvestmentPosition> {
  return client.request('/api/v2/investments/positions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateInvestmentHoldings(
  positionId: string,
  payload: {
    units: string;
    costTotal: string;
    movementType: InvestmentMovementType;
    note?: string | null;
  },
): Promise<MobileInvestmentPosition> {
  return client.request(`/api/v2/investments/positions/${encodeURIComponent(positionId)}/holdings`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function fetchInvestmentMovements(positionId: string): Promise<MobileInvestmentMovement[]> {
  return client.request(
    `/api/v2/investments/positions/${encodeURIComponent(positionId)}/movements`,
  );
}

export function refreshInvestmentNavs(force = false): Promise<{
  results: { isin: string; status: string; message?: string | null }[];
  refreshedAccounts: number;
}> {
  return client.request(`/api/v2/investments/nav/refresh?force=${force ? 'true' : 'false'}`, {
    method: 'POST',
  });
}

export function fetchInvestmentHistory(
  accountId: string,
  range: InvestmentRange,
): Promise<MobileInvestmentHistory> {
  return client.request(
    `/api/v2/investments/portfolios/${encodeURIComponent(accountId)}/history?range=${range}`,
  );
}
