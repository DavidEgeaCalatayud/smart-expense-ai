import type { TransactionCategory } from '../types/transactions';
import { apiFetch } from './apiClient';

export function fetchCategories(): Promise<TransactionCategory[]> {
  return apiFetch<TransactionCategory[]>('/categories');
}
