export function normalizeCategoryName(value: string): string {
  const normalized = value.trim().split(/\s+/).filter(Boolean).join(' ');
  if (!normalized) {
    throw new Error('Category name must not be empty');
  }
  if (normalized.length > 80) {
    throw new Error('Category name must be 80 characters or fewer');
  }
  return normalized;
}

export function normalizedCategoryKey(value: string): string {
  return normalizeCategoryName(value).toLocaleLowerCase();
}
