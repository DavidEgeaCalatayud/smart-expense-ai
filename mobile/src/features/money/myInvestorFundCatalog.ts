export interface MyInvestorFundCatalogItem {
  isin: string;
  name: string;
  manager: string;
}

export const MYINVESTOR_FUND_CATALOG: readonly MyInvestorFundCatalogItem[] = [
  { isin: 'IE00BN6QDF87', name: 'Vanguard Global Bond Index Fund USD Hedged Distribution', manager: 'Vanguard' },
  { isin: 'IE00B2RHVR18', name: 'Vanguard Global Bond Index Fund CHF Hedged Acc', manager: 'Vanguard' },
  { isin: 'IE00B18GCB14', name: 'Vanguard Global Bond Index Fund USD Hedged Acc', manager: 'Vanguard' },
  { isin: 'IE00BGCZ0826', name: 'Vanguard Global Bond Index Inv USDH Acc', manager: 'Vanguard' },
  { isin: 'IE00B18GC888', name: 'Vanguard Global Bond Index Fund EUR Hedged Acc', manager: 'Vanguard' },
  { isin: 'IE00B50W2R13', name: 'Vanguard Global Bond Index Fund GBP Hedged Acc', manager: 'Vanguard' },
  { isin: 'IE00BD0NCN62', name: 'iShares Developed World Index (IE) D Acc USD', manager: 'BlackRock' },
  { isin: 'IE00BD0NCM55', name: 'iShares Developed World Index (IE) D Acc EUR', manager: 'BlackRock' },
  { isin: 'IE000M0KK797', name: 'iShares Developed World Index Fund (IE) D Acc EUR Hedged', manager: 'BlackRock' },
  { isin: 'IE000ZYRH0Q7', name: 'iShares Developed World Index (IE) Acc EUR clase S', manager: 'BlackRock' },
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
