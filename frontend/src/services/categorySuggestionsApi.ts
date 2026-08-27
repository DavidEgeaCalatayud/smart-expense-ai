import type { TransactionType } from '../types/transactions';
import { apiFetch } from './apiClient';

export interface CategorySuggestionPreview {
  categoryId: string;
  categoryName: string;
  source: 'user_history' | 'global_model';
  modelVersion: string;
  featurePolicy: string;
}

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
