import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLatestHistoricalAnalysis,
  runHistoricalAnalysis,
} from '../../services/historicalAnalysisApi';
import type { HistoricalAnalysis } from '../../types/historicalAnalysis';
import { HistoricalAnalysisPanel } from './HistoricalAnalysisPanel';

vi.mock('../../services/historicalAnalysisApi', () => ({
  fetchLatestHistoricalAnalysis: vi.fn(),
  runHistoricalAnalysis: vi.fn(),
}));

const analysis: HistoricalAnalysis = {
  snapshotId: 'snapshot-1',
  analysisVersion: 'historical-v2.2',
  windowMonths: 12,
  periodStart: '2025-07-01',
  periodEnd: '2026-06-20',
  analyzedTransactions: 42,
  generatedAt: '2026-08-24T13:30:00Z',
  monthlySpend: [
    { month: '2026-05', amount: '410.00', isComplete: true, daysObserved: 31, daysInMonth: 31 },
    { month: '2026-06', amount: '260.00', isComplete: false, daysObserved: 20, daysInMonth: 30 },
  ],
  monthCompleteness: {
    strategy: 'exclude_partial',
    partialMonth: '2026-06',
    completeMonthsUsed: 11,
    reason: 'The dataset cutoff falls before calendar month-end.',
  },
  trend: {
    direction: 'increasing',
    monthlySlope: '18.50',
    averageMonthlySpend: '390.25',
    rSquared: '0.742',
    activeMonths: 10,
    completeMonthsUsed: 11,
    excludedPartialMonth: '2026-06',
  },
  recurringProfiles: [
    {
      streamKey: 'generic service::monthly-day-05',
      streamDescriptor: null,
      streamBasis: 'calendar_phase',
      streamCalendar: 'monthly:day-05',
      merchant: 'Generic Service',
      canonicalMerchant: 'generic service',
      observedMerchants: ['Generic Service'],
      cadence: 'monthly',
      occurrenceCount: 8,
      medianAmount: '9.99',
      medianIntervalDays: '30.0',
      intervalRegularity: '0.967',
      dayOfMonthStability: '0.980',
      monthEndFit: '0.000',
      dayOfWeekStability: '0.375',
      amountStability: '1.000',
      amountMad: '0.00',
      amountCv: '0.000',
      cadenceFit: '1.000',
      historyDepth: '1.000',
      consecutivePeriods: 8,
      missedExpectedOccurrences: 1,
      isExpectedPaymentMissing: true,
      patternScore: '98.4',
      nextExpectedDate: '2026-07-05',
    },
  ],
  recurrenceSegmentation: {
    strategy: 'canonical_merchant_then_descriptor_amount_then_temporal_phase',
    analysisVersion: 'historical-v2.2',
    profileCount: 1,
    temporalPhaseProfileCount: 1,
    ambiguityPolicy: 'split_only_with_repeated_concurrent_calendar_evidence',
  },
  outliers: [
    {
      transactionId: 'tx-1',
      merchant: 'CLOUD TOOLS*9922',
      canonicalMerchant: 'cloud tools',
      category: 'Shopping',
      date: '2026-05-10',
      amount: '80.00',
      baselineScope: 'merchant',
      baselineCount: 4,
      baselineMedian: '10.00',
      robustSpread: '1.00',
      deviationScore: '70.00',
    },
  ],
  categoryShifts: [
    {
      category: 'Food',
      direction: 'increasing',
      previousThreeMonthAverage: '100.00',
      currentThreeMonthAverage: '150.00',
      delta: '50.00',
      percentChange: '50.0',
      comparisonMonths: ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'],
    },
  ],
  coverage: {
    transactionCount: 42,
    activeMonths: 10,
    completeMonths: 11,
    partialMonthsExcluded: 1,
    canonicalMerchants: 7,
    merchantsWithBaseline: 4,
    categoriesWithBaseline: 3,
    recurringProfiles: 1,
    recurringStreams: 1,
    temporalPhaseStreams: 1,
    outlierCount: 1,
  },
};

describe('HistoricalAnalysisPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLatestHistoricalAnalysis).mockResolvedValue(analysis);
    vi.mocked(runHistoricalAnalysis).mockResolvedValue(analysis);
  });

  it('renders temporal stream evidence', async () => {
    render(<HistoricalAnalysisPanel />);

    expect(await screen.findByText('Behavior over time')).toBeInTheDocument();
    expect(screen.getByText('Increasing')).toBeInTheDocument();
    expect(screen.getByText(/Partial month excluded from trend calculations/i)).toBeInTheDocument();
    expect(screen.getByText('Recurring streams')).toBeInTheDocument();
    expect(screen.getByText('generic service')).toBeInTheDocument();
    expect(screen.getByText('98.4')).toBeInTheDocument();
    expect(screen.getByText(/Expected payment appears overdue/i)).toBeInTheDocument();
    expect(screen.getByText(/baseline €10\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/Deterministic 0–100 pattern index per stream; not a probability/i)).toBeInTheDocument();
  });

  it('runs a new 12-month snapshot and replaces the displayed analysis', async () => {
    render(<HistoricalAnalysisPanel />);
    await screen.findByText('generic service');

    fireEvent.click(screen.getByRole('button', { name: 'Run 12-month analysis' }));

    await waitFor(() => expect(runHistoricalAnalysis).toHaveBeenCalledWith(12));
  });
});
