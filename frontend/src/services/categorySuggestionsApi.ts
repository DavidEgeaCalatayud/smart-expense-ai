import type { CategorySuggestionPreview, TransactionType } from '../types/transactions';
import { apiFetch } from './apiClient';

export function previewCategorySuggestion(
  merchant: string,
  type: TransactionType,
): Promise<CategorySuggestionPreview> {
  return apiFetch<CategorySuggestionPreview>(
    '/category-suggestions/preview',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: merchant.trim(), type }),
    },
    'v2',
  );
}
