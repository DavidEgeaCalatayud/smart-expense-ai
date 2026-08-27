import type { TransactionCategory, TransactionType } from '../types/transactions';
import { apiFetch } from './apiClient';

export function fetchCategories(includeArchived = false): Promise<TransactionCategory[]> {
  const query = includeArchived ? '?includeArchived=true' : '';
  return apiFetch<TransactionCategory[]>(`/categories${query}`);
}

export function createCategory(payload: {
  name: string;
  transactionType: TransactionType;
}): Promise<TransactionCategory> {
  return apiFetch<TransactionCategory>('/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function renameCategory(categoryId: string, name: string): Promise<TransactionCategory> {
  return apiFetch<TransactionCategory>(`/categories/${categoryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function archiveCategory(
  categoryId: string,
  payload: { mode: 'archive' | 'reassign'; reassignToCategoryId?: string },
): Promise<TransactionCategory> {
  return apiFetch<TransactionCategory>(`/categories/${categoryId}/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function restoreCategory(categoryId: string): Promise<TransactionCategory> {
  return apiFetch<TransactionCategory>(`/categories/${categoryId}/restore`, { method: 'POST' });
}
