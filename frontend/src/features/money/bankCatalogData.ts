import type { FinancialAccountType } from '../../types/financialAccounts';

export interface BankInstitution {
  id: string;
  name: string;
  domain: string;
  aliases: string[];
  suggestedType: FinancialAccountType;
}

export const BANK_INSTITUTIONS: BankInstitution[] = [
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
  { id: 'trade-republic', name: 'Trade Republic', domain: 'traderepublic.com', aliases: ['trade republic bank'], suggestedType: 'broker' },
  { id: 'myinvestor', name: 'MyInvestor', domain: 'myinvestor.es', aliases: ['my investor'], suggestedType: 'broker' },
  { id: 'wise', name: 'Wise', domain: 'wise.com', aliases: ['transferwise'], suggestedType: 'wallet' },
  { id: 'paypal', name: 'PayPal', domain: 'paypal.com', aliases: [], suggestedType: 'wallet' },
];

export function normalizeBankSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function findBankInstitution(value: string | null | undefined): BankInstitution | null {
  if (!value) return null;
  const normalized = normalizeBankSearch(value);
  return BANK_INSTITUTIONS.find((bank) => (
    normalizeBankSearch(bank.name) === normalized
    || bank.aliases.some((alias) => normalizeBankSearch(alias) === normalized)
  )) ?? null;
}

export function filterBankInstitutions(query: string): BankInstitution[] {
  const normalizedQuery = normalizeBankSearch(query);
  if (!normalizedQuery) return BANK_INSTITUTIONS;
  return BANK_INSTITUTIONS.filter((bank) => {
    const haystack = [bank.name, bank.domain, ...bank.aliases]
      .map(normalizeBankSearch)
      .join(' ');
    return haystack.includes(normalizedQuery);
  });
}
