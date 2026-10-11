export interface MyInvestorFundCatalogItem {
  isin: string;
  name: string;
  manager: string;
}

export const MYINVESTOR_FUND_CATALOG: readonly MyInvestorFundCatalogItem[] = [
  { isin: 'IE000ZYRH0Q7', name: 'iShares Developed World Index (IE) Acc EUR clase S', manager: 'BlackRock' },
  { isin: 'IE00BD0NCM55', name: 'iShares Developed World Index (IE) D Acc EUR', manager: 'BlackRock' },
  { isin: 'IE00B18GC888', name: 'Vanguard Global Bond Index Fund EUR Hedged Acc', manager: 'Vanguard' },
];

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function searchMyInvestorFunds(query: string): MyInvestorFundCatalogItem[] {
  const term = normalize(query);
  if (!term) return MYINVESTOR_FUND_CATALOG;
  return MYINVESTOR_FUND_CATALOG.filter((fund) =>
    normalize(`${fund.name} ${fund.isin} ${fund.manager}`).includes(term));
}
