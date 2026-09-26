import {
  filterMobileBankInstitutions,
  findMobileBankInstitution,
} from '../src/features/money/bankCatalogData';

describe('mobile bank catalog', () => {
  it('prefers an exact institution name over another bank alias', () => {
    expect(findMobileBankInstitution('CaixaBank')?.id).toBe('caixabank');
    expect(findMobileBankInstitution('imaginbank')?.id).toBe('imagin');
  });

  it('matches aliases used by common banks and platforms', () => {
    expect(findMobileBankInstitution('Santander')?.id).toBe('santander');
    expect(findMobileBankInstitution('My Investor')?.id).toBe('myinvestor');
  });

  it('filters the visual picker by name, domain and aliases', () => {
    expect(filterMobileBankInstitutions('trade').map((bank) => bank.id)).toContain('trade-republic');
    expect(filterMobileBankInstitutions('transferwise').map((bank) => bank.id)).toContain('wise');
    expect(filterMobileBankInstitutions('bbva.es').map((bank) => bank.id)).toContain('bbva');
  });
});
