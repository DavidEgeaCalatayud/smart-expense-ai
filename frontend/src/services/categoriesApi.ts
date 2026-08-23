import type { TransactionCategory } from '../types/transactions';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const CATEGORIES_ENDPOINT = `${API_BASE_URL}/api/categories`;

export async function fetchCategories(): Promise<TransactionCategory[]> {
  const response = await fetch(CATEGORIES_ENDPOINT);

  if (!response.ok) {
    throw new Error('Unable to fetch categories');
  }

  return response.json();
}
