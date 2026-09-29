import { describe, expect, it } from 'vitest';
import { BANK_INSTITUTIONS, filterBankInstitutions, findBankInstitution } from './bankCatalogData';

describe('bank catalog', () => {
  it('prefers an exact institution name over another bank alias', () => {
    expect(findBankInstitution('CaixaBank')?.id).toBe('caixabank');
    expect(findBankInstitution('imaginbank')?.id).toBe('imagin');
  });

  it('matches common aliases without case or accent sensitivity', () => {
    expect(findBankInstitution('Santander')?.id).toBe('santander');
    expect(findBankInstitution('My Investor')?.id).toBe('myinvestor');
    expect(findBankInstitution('trading212')?.id).toBe('trading-212');
    expect(findBankInstitution('quant fury')?.id).toBe('quantfury');
    expect(findBankInstitution('e toro')?.id).toBe('etoro');
    expect(findBankInstitution('getcollectr')?.id).toBe('collectr');
  });

  it('marks investment platforms as brokers so they sum in Invertido', () => {
    for (const value of ['Trading 212', 'Quantfury', 'MyInvestor', 'Trade Republic', 'eToro', 'Collectr']) {
      expect(findBankInstitution(value)?.suggestedType).toBe('broker');
    }
  });

  it('returns the complete catalog when no search is entered', () => {
    expect(filterBankInstitutions('')).toHaveLength(BANK_INSTITUTIONS.length);
    expect(filterBankInstitutions('').map((bank) => bank.id)).toContain('etoro');
  });

  it('filters banks by name, domain and aliases', () => {
    expect(filterBankInstitutions('trade').map((bank) => bank.id)).toContain('trade-republic');
    expect(filterBankInstitutions('trading212.com').map((bank) => bank.id)).toContain('trading-212');
    expect(filterBankInstitutions('quantfury.com').map((bank) => bank.id)).toContain('quantfury');
    expect(filterBankInstitutions('etoro.com').map((bank) => bank.id)).toContain('etoro');
    expect(filterBankInstitutions('collectr').map((bank) => bank.id)).toContain('collectr');
    expect(filterBankInstitutions('getcollectr.com').map((bank) => bank.id)).toContain('collectr');
    expect(filterBankInstitutions('transferwise').map((bank) => bank.id)).toContain('wise');
    expect(filterBankInstitutions('bbva.es').map((bank) => bank.id)).toContain('bbva');
  });
});
