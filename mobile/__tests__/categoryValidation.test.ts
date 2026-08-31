import {
  normalizeCategoryName,
  normalizedCategoryKey,
} from '../src/features/categories/validation';

describe('offline category validation', () => {
  it('normalizes surrounding and repeated whitespace', () => {
    expect(normalizeCategoryName('  Viajes   y   ocio  ')).toBe('Viajes y ocio');
  });

  it('builds the case-insensitive local uniqueness key from the canonical name', () => {
    expect(normalizedCategoryKey('  Gimnasio ')).toBe('gimnasio');
  });

  it('rejects empty and oversized category names', () => {
    expect(() => normalizeCategoryName('   ')).toThrow('must not be empty');
    expect(() => normalizeCategoryName('x'.repeat(81))).toThrow('80 characters or fewer');
  });
});
