import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAdvancedInsightEntitlements,
  fetchAdvancedInsights,
} from '../services/advancedInsightsApi';
import { AdvancedInsightsPage } from './AdvancedInsightsPage';

vi.mock('../services/advancedInsightsApi', () => ({
  fetchAdvancedInsightEntitlements: vi.fn(),
  fetchAdvancedInsights: vi.fn(),
}));

describe('AdvancedInsightsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the real Premium lock for a free account without requesting insights', async () => {
    vi.mocked(fetchAdvancedInsightEntitlements).mockResolvedValue({
      policyVersion: 'premium-entitlements-v1',
      enforcementMode: 'observe_only',
      planTier: 'free',
      features: {
        advancedInsights: { eligible: false, enabled: false },
      },
    });

    render(<AdvancedInsightsPage />);

    expect(await screen.findByText('Análisis avanzados Premium')).toBeInTheDocument();
    expect(screen.getByText(/no están incluidos actualmente en tu cuenta/i)).toBeInTheDocument();
    expect(fetchAdvancedInsights).not.toHaveBeenCalled();
  });

  it('renders server-formatted evidence without recomputing insight arithmetic', async () => {
    vi.mocked(fetchAdvancedInsightEntitlements).mockResolvedValue({
      policyVersion: 'premium-entitlements-v1',
      enforcementMode: 'observe_only',
      planTier: 'premium',
      features: {
        advancedInsights: { eligible: true, enabled: true },
      },
    });
    vi.mocked(fetchAdvancedInsights).mockResolvedValue({
      insightVersion: 'advanced-financial-insights-v1',
      month: '2026-09',
      currency: 'EUR',
      sourceContracts: {
        monthlyReport: 'monthly-financial-report-v1',
        intelligenceRules: 'rules-v2',
        budgetProgress: 'budget-service',
      },
      limitations: ['No invented forecast confidence.'],
      insights: [
        {
          id: '2026-09:budget-pressure',
          kind: 'budget_pressure',
          priority: 'attention',
          title: 'Budget pressure',
          summary: '1 of 1 configured budgets are over limit.',
          evidence: [
            {
              source: 'budgets',
              reference: '2026-09',
              metrics: [
                { key: 'overBudgetCount', label: 'Over budget', value: '1', format: 'count' },
                {
                  key: 'highestPercentUsed',
                  label: 'Highest utilization',
                  value: '111.1',
                  format: 'percent',
                },
              ],
            },
          ],
        },
        {
          id: '2026-09:cash-flow',
          kind: 'cash_flow',
          priority: 'positive',
          title: 'Monthly cash flow',
          summary: 'Income exceeds expenses by €100.00 for 2026-09.',
          evidence: [
            {
              source: 'monthly-financial-report-v1',
              reference: '2026-09',
              metrics: [
                { key: 'totalIncome', label: 'Income', value: '200.00', format: 'currency' },
                { key: 'totalExpenses', label: 'Expenses', value: '100.00', format: 'currency' },
              ],
            },
          ],
        },
      ],
    });

    render(<AdvancedInsightsPage />);

    expect(await screen.findByText('Budget pressure')).toBeInTheDocument();
    expect(screen.getByText('111.1%')).toBeInTheDocument();
    expect(screen.getByText('Monthly cash flow')).toBeInTheDocument();
    expect(screen.getByText('€200.00')).toBeInTheDocument();
    expect(screen.getByText('€100.00')).toBeInTheDocument();
    expect(screen.getByText(/No invented forecast confidence\./)).toBeInTheDocument();
  });

  it('does not misrepresent an entitlement lookup failure as a Free lock', async () => {
    vi.mocked(fetchAdvancedInsightEntitlements).mockRejectedValue(new Error('network unavailable'));

    render(<AdvancedInsightsPage />);

    expect(await screen.findByText('No se ha podido comprobar el acceso a análisis')).toBeInTheDocument();
    expect(screen.queryByText('Análisis avanzados Premium')).not.toBeInTheDocument();
    expect(fetchAdvancedInsights).not.toHaveBeenCalled();
  });
});
