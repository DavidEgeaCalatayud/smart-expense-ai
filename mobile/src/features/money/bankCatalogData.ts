import type { FinancialAccountType } from '@smart-expense-ai/api-contracts';

export interface MobileBankInstitution {
  id: string;
  name: string;
  domain: string;
  aliases: string[];
  suggestedType: FinancialAccountType;
}

export const MOBILE_BANK_INSTITUTIONS: MobileBankInstitution[] = [
  { id: 'bankinter', name: 'Bankinter', domain: 'bankinter.com', aliases: ['bank inter'], suggestedType: 'checking' },
  { id: 'imagin', name: 'imagin', domain: 'imagin.com', aliases: ['imaginbank', 'imagin bank', 'caixabank'], suggestedType: 'checking' },
  { id: 'caixabank', name: 'CaixaBank', domain: 'caixabank.es', aliases: ['la caixa', 'caixa'], suggestedType: 'checking' },
  { id: 'santander', name: 'Banco Santander', domain: 'bancosantander.es', aliases: ['santander'], suggestedType: 'checking' },
  { id: 'bbva', name: 'BBVA', domain: 'bbva.es', aliases: [], suggestedType: 'checking' },
  { id: 'sabadell', name: 'Banco Sabadell', domain: 'bancsabadell.com', aliases: ['sabadell'], suggestedType: 'checking' },
  { id: 'ing', name: 'ING', domain: 'ing.es', aliases: ['ing direct'], suggestedType: 'checking' },
  { id: 'openbank', name: 'Openbank', domain: 'openbank.es', aliases: ['open bank'], suggestedType: 'checking' },
  { id: 'unicaja', name: 'Unicaja Banco', domain: 'unicajabanco.es', aliases: ['unicaja'], suggestedType: 'checking' },
  { id: 'kutxabank', name: 'Kutxabank', domain: 'kutxabank.es', aliases: [], suggestedType: 'checking' },
  { id: 'abanca', name: 'ABANCA', domain: 'abanca.com', aliases: [], suggestedType: 'checking' },
  { id: 'cajamar', name: 'Cajamar', domain: 'grupocooperativocajamar.es', aliases: ['grupo cajamar'], suggestedType: 'checking' },
  { id: 'ibercaja', name: 'Ibercaja', domain: 'ibercaja.es', aliases: [], suggestedType: 'checking' },
  { id: 'revolut', name: 'Revolut', domain: 'revolut.com', aliases: [], suggestedType: 'wallet' },
  { id: 'n26', name: 'N26', domain: 'n26.com', aliases: [], suggestedType: 'checking' },
  { id: 'trading-212', name: 'Trading 212', domain: 'trading212.com', aliases: ['trading212', 'trading 212 invest'], suggestedType: 'broker' },
  { id: 'quantfury', name: 'Quantfury', domain: 'quantfury.com', aliases: ['quant fury'], suggestedType: 'broker' },
  { id: 'trade-republic', name: 'Trade Republic', domain: 'traderepublic.com', aliases: ['trade republic bank'], suggestedType: 'broker' },
  { id: 'myinvestor', name: 'MyInvestor', domain: 'myinvestor.es', aliases: ['my investor'], suggestedType: 'broker' },
  { id: 'etoro', name: 'eToro', domain: 'etoro.com', aliases: ['e toro', 'etoro money'], suggestedType: 'broker' },
  { id: 'collectr', name: 'Collectr', domain: 'getcollectr.com', aliases: ['collectr app', 'getcollectr', 'tcg portfolio'], suggestedType: 'broker' },
  { id: 'wise', name: 'Wise', domain: 'wise.com', aliases: ['transferwise'], suggestedType: 'wallet' },
  { id: 'paypal', name: 'PayPal', domain: 'paypal.com', aliases: [], suggestedType: 'wallet' },
];

export function normalizeMobileBankSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function findMobileBankInstitution(value: string | null | undefined): MobileBankInstitution | null {
  if (!value) return null;
  const normalized = normalizeMobileBankSearch(value);
  const exactName = MOBILE_BANK_INSTITUTIONS.find(
    (bank) => normalizeMobileBankSearch(bank.name) === normalized,
  );
  if (exactName) return exactName;
  return MOBILE_BANK_INSTITUTIONS.find((bank) => (
    bank.aliases.some((alias) => normalizeMobileBankSearch(alias) === normalized)
  )) ?? null;
}

export function filterMobileBankInstitutions(query: string): MobileBankInstitution[] {
  const normalizedQuery = normalizeMobileBankSearch(query);
  if (!normalizedQuery) return MOBILE_BANK_INSTITUTIONS;
  return MOBILE_BANK_INSTITUTIONS.filter((bank) => (
    [bank.name, bank.domain, ...bank.aliases]
      .map(normalizeMobileBankSearch)
      .join(' ')
      .includes(normalizedQuery)
  ));
}

export function suggestedMobileAccountNameForInstitution(
  currentName: string,
  currentInstitution: string,
  nextInstitution: string,
): string {
  const cleanName = currentName.trim();
  const cleanInstitution = currentInstitution.trim();
  if (!cleanName || (cleanInstitution !== '' && cleanName === cleanInstitution)) {
    return nextInstitution;
  }
  return currentName;
}
