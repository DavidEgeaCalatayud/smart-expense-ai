import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchUpcomingPayments } from '../services/upcomingPaymentsApi';
import { PredictionsPage } from './PredictionsPage';

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

describe('PredictionsPage recurring calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchUpcomingPayments).mockResolvedValue(report);
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
