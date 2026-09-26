import { describe, expect, it } from 'vitest';
import { filterBankInstitutions, findBankInstitution } from './bankCatalogData';

describe('bank catalog', () => {
  it('prefers an exact institution name over another bank alias', () => {
    expect(findBankInstitution('CaixaBank')?.id).toBe('caixabank');
    expect(findBankInstitution('imaginbank')?.id).toBe('imagin');
  });

  it('matches common aliases without case or accent sensitivity', () => {
    expect(findBankInstitution('Santander')?.id).toBe('santander');
    expect(findBankInstitution('My Investor')?.id).toBe('myinvestor');
  });

  it('filters banks by name, domain and aliases', () => {
    expect(filterBankInstitutions('trade').map((bank) => bank.id)).toContain('trade-republic');
    expect(filterBankInstitutions('transferwise').map((bank) => bank.id)).toContain('wise');
    expect(filterBankInstitutions('bbva.es').map((bank) => bank.id)).toContain('bbva');
  });
});
