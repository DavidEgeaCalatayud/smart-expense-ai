import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSpendingForecast } from '../services/spendingForecastApi';
import { fetchUpcomingPayments } from '../services/upcomingPaymentsApi';
import { PredictionsPage } from './PredictionsPage';

vi.mock('../services/spendingForecastApi', () => ({
  fetchSpendingForecast: vi.fn(),
}));
vi.mock('../services/upcomingPaymentsApi', () => ({
  fetchUpcomingPayments: vi.fn(),
}));

const report = {
  projectionVersion: 'recurring-calendar-v1',
  analysisVersion: 'historical-v2.2',
  asOf: '2026-08-27',
  windowStart: '2026-08-27',
  windowEnd: '2026-09-25',
  days: 30,
  expectedTotal: '28.98',
  upcomingCount: 2,
  overdueCount: 1,
  upcomingPayments: [
    {
      streamKey: 'spotify::premium',
      merchant: 'Spotify',
      canonicalMerchant: 'spotify',
      expectedDate: '2026-09-01',
      expectedAmount: '10.99',
      status: 'expected' as const,
      cadence: 'monthly',
      patternScore: '94.2',
      amountStability: '1.000',
      historyDepth: '1.000',
      occurrenceCount: 8,
      missedExpectedOccurrences: 0,
      streamBasis: 'descriptor_amount',
      priceRegimeCount: 1,
      lifecycleReactivated: false,
      explanation: 'Strong deterministic recurrence evidence; this score is not a probability.',
    },
    {
      streamKey: 'netflix::default',
      merchant: 'Netflix',
      canonicalMerchant: 'netflix',
      expectedDate: '2026-09-07',
      expectedAmount: '17.99',
      status: 'price_changed' as const,
      cadence: 'monthly',
      patternScore: '88.0',
      amountStability: '0.920',
      historyDepth: '1.000',
      occurrenceCount: 7,
      missedExpectedOccurrences: 0,
      streamBasis: 'merchant_price_continuity',
      priceRegimeCount: 2,
      lifecycleReactivated: false,
      explanation: 'The lifecycle engine preserved the stream across two sequential price regimes.',
    },
  ],
  overduePayments: [
    {
      streamKey: 'gym::membership',
      merchant: 'Gym',
      canonicalMerchant: 'gym',
      expectedDate: '2026-08-03',
      expectedAmount: '29.99',
      status: 'overdue' as const,
      cadence: 'monthly',
      patternScore: '91.0',
      amountStability: '1.000',
      historyDepth: '1.000',
      occurrenceCount: 6,
      missedExpectedOccurrences: 1,
      streamBasis: 'descriptor_amount',
      priceRegimeCount: 1,
      lifecycleReactivated: false,
      explanation: 'The monthly schedule is past its grace window.',
    },
  ],
};

const forecast = {
  forecastVersion: 'spending-forecast-v1',
  asOf: '2026-08-27',
  month: '2026-08',
  daysInMonth: 31,
  elapsedDays: 27,
  remainingDays: 4,
  spentSoFar: '420.00',
  historicalThreeMonthMean: '500.00',
  backtestCutoffDay: 15,
  backtestMonths: 6,
  baselines: [
    {
      baseline: 'three_month_mean' as const,
      label: 'Previous 3 complete months',
      available: true,
      projectedMonthEnd: '500.00',
      differenceFromThreeMonthMean: '0.00',
      assumptions: ['Uses only the three complete calendar months before the forecast month.'],
      evidence: { completeMonths: 3 },
      backtest: { support: 6, cutoffDay: 15, mae: '35.00', smapePercent: '7.200', bias: '-5.00' },
    },
    {
      baseline: 'run_rate' as const,
      label: 'Current-month run rate',
      available: true,
      projectedMonthEnd: '482.22',
      differenceFromThreeMonthMean: '-17.78',
      assumptions: ['Assumes the observed daily spending rate continues through month end.'],
      evidence: { elapsedDays: 27 },
      backtest: { support: 6, cutoffDay: 15, mae: '48.00', smapePercent: '9.100', bias: '12.00' },
    },
    {
      baseline: 'recurrence_aware' as const,
      label: 'Recurrence-aware projection',
      available: true,
      projectedMonthEnd: '455.99',
      differenceFromThreeMonthMean: '-44.01',
      assumptions: ['Keeps spending already observed this month exactly once.'],
      evidence: { expectedRecurringRemaining: '10.99' },
      backtest: { support: 6, cutoffDay: 15, mae: '22.50', smapePercent: '4.500', bias: '-2.50' },
    },
  ],
};

describe('PredictionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchUpcomingPayments).mockResolvedValue(report);
    vi.mocked(fetchSpendingForecast).mockResolvedValue(forecast);
  });

  it('renders month-end baselines with comparable backtest evidence', async () => {
    render(<PredictionsPage />);

    const forecastRegion = await screen.findByRole('region', { name: 'Month-end spending forecast' });
    expect(within(forecastRegion).getByText('€420.00 spent through 27 Aug 2026 · 4 days remaining')).toBeInTheDocument();
    expect(within(forecastRegion).getByText('Previous 3 complete months')).toBeInTheDocument();
    expect(within(forecastRegion).getByText('Current-month run rate')).toBeInTheDocument();
    expect(within(forecastRegion).getByText('Recurrence-aware projection')).toBeInTheDocument();
    expect(within(forecastRegion).getByText('€455.99')).toBeInTheDocument();
    expect(within(forecastRegion).getByText('€22.50')).toBeInTheDocument();
    expect(within(forecastRegion).getAllByText(/6 walk-forward months · day 15 cutoff/)).toHaveLength(3);
    expect(within(forecastRegion).getByText(/same day-15 chronological folds/)).toBeInTheDocument();
  });

  it('renders future totals separately from overdue recurring schedules', async () => {
    render(<PredictionsPage />);

    expect(await screen.findByText('€28.98')).toBeInTheDocument();
    expect(screen.getByText('Upcoming charges').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Overdue schedules').parentElement).toHaveTextContent('1');

    const calendar = screen.getByRole('region', { name: 'Upcoming recurring payment calendar' });
    expect(within(calendar).getByText('Spotify')).toBeInTheDocument();
    expect(within(calendar).getByText('Netflix')).toBeInTheDocument();
    expect(within(calendar).getByText('Price changed')).toBeInTheDocument();

    const overdue = screen.getByRole('region', { name: 'Overdue recurring payments' });
    expect(within(overdue).getByText('Gym')).toBeInTheDocument();
    expect(within(overdue).getByText('Overdue')).toBeInTheDocument();
  });
});
