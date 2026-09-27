import {
  filterMobileBankInstitutions,
  findMobileBankInstitution,
  MOBILE_BANK_INSTITUTIONS,
} from '../src/features/money/bankCatalogData';

describe('mobile bank catalog', () => {
  it('prefers an exact institution name over another bank alias', () => {
    expect(findMobileBankInstitution('CaixaBank')?.id).toBe('caixabank');
    expect(findMobileBankInstitution('imaginbank')?.id).toBe('imagin');
  });

  it('matches aliases used by common banks and platforms', () => {
    expect(findMobileBankInstitution('Santander')?.id).toBe('santander');
    expect(findMobileBankInstitution('My Investor')?.id).toBe('myinvestor');
    expect(findMobileBankInstitution('trading212')?.id).toBe('trading-212');
    expect(findMobileBankInstitution('quant fury')?.id).toBe('quantfury');
    expect(findMobileBankInstitution('e toro')?.id).toBe('etoro');
    expect(findMobileBankInstitution('getcollectr')?.id).toBe('collectr');
  });

  it('marks investment platforms as brokers so they sum in Invertido', () => {
    for (const value of ['Trading 212', 'Quantfury', 'MyInvestor', 'Trade Republic', 'eToro', 'Collectr']) {
      expect(findMobileBankInstitution(value)?.suggestedType).toBe('broker');
    }
  });

  it('returns the complete catalog when no search is entered', () => {
    expect(filterMobileBankInstitutions('')).toHaveLength(MOBILE_BANK_INSTITUTIONS.length);
    expect(filterMobileBankInstitutions('').map((bank) => bank.id)).toContain('etoro');
  });

  it('filters the visual picker by name, domain and aliases', () => {
    expect(filterMobileBankInstitutions('trade').map((bank) => bank.id)).toContain('trade-republic');
    expect(filterMobileBankInstitutions('trading212.com').map((bank) => bank.id)).toContain('trading-212');
    expect(filterMobileBankInstitutions('quantfury.com').map((bank) => bank.id)).toContain('quantfury');
    expect(filterMobileBankInstitutions('etoro.com').map((bank) => bank.id)).toContain('etoro');
    expect(filterMobileBankInstitutions('collectr').map((bank) => bank.id)).toContain('collectr');
    expect(filterMobileBankInstitutions('getcollectr.com').map((bank) => bank.id)).toContain('collectr');
    expect(filterMobileBankInstitutions('transferwise').map((bank) => bank.id)).toContain('wise');
    expect(filterMobileBankInstitutions('bbva.es').map((bank) => bank.id)).toContain('bbva');
  });
});
