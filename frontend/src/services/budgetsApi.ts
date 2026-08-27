import type { BudgetDefinition, BudgetMonth } from '../types/budgets';
import { apiFetch } from './apiClient';

export function fetchBudgets(month: string): Promise<BudgetMonth> {
  return apiFetch<BudgetMonth>(`/budgets?month=${encodeURIComponent(month)}`, {}, 'v2');
}

export function createBudget(payload: {
  month: string;
  categoryId: string | null;
  limitAmount: string;
}): Promise<BudgetDefinition> {
  return apiFetch<BudgetDefinition>('/budgets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'v2');
}

export function updateBudget(budgetId: string, limitAmount: string): Promise<BudgetDefinition> {
  return apiFetch<BudgetDefinition>(`/budgets/${budgetId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limitAmount }),
  }, 'v2');
}

export function deleteBudget(budgetId: string): Promise<void> {
  return apiFetch<void>(`/budgets/${budgetId}`, { method: 'DELETE' }, 'v2');
}
