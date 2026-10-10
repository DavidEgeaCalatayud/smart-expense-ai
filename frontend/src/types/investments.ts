export type InvestmentRange = '1m' | '3m' | '1y' | 'all';
export type InvestmentMovementType =
  | 'contribution'
  | 'sale'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment';

export interface InvestmentPosition {
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

export interface InvestmentPortfolio {
  financialAccountId: string;
  name: string;
  institution: string | null;
  totalValue: string;
  totalCost: string;
  gainAmount: string;
  gainPercent: string | null;
  latestValuationDate: string | null;
  positions: InvestmentPosition[];
}

export interface InvestmentHistoryPoint {
  date: string;
  value: string;
  cost: string;
}

export interface InvestmentPortfolioHistory {
  financialAccountId: string;
  range: InvestmentRange;
  points: InvestmentHistoryPoint[];
}

export interface NavRefreshResult {
  isin: string;
  status: 'updated' | 'cached' | 'unsupported' | 'failed';
  nav: string | null;
  valuationDate: string | null;
  provider: string | null;
  message: string | null;
}

export interface NavRefreshResponse {
  results: NavRefreshResult[];
  refreshedAccounts: number;
}
