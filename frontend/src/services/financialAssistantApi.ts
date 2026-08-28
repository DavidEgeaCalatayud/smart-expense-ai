import { apiFetch } from './apiClient';
import type { FinancialAssistantAnswer } from '../types/financialAssistant';

export async function queryFinancialAssistant(question: string): Promise<FinancialAssistantAnswer> {
  return apiFetch<FinancialAssistantAnswer>(
    '/assistant/query',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    },
    'v2',
  );
}
