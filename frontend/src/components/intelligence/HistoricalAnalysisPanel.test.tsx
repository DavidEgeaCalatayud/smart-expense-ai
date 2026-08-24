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
  analysisVersion: 'historical-v1',
  windowMonths: 12,
  periodStart: '2025-07-01',
  periodEnd: '2026-06-30',
  analyzedTransactions: 42,
  generatedAt: '2026-08-24T13:30:00Z',
  monthlySpend: [
    { month: '2026-05', amount: '410.00' },
    { month: '2026-06', amount: '460.00' },
  ],
  trend: {
    direction: 'increasing',
    monthlySlope: '18.50',
    averageMonthlySpend: '390.25',
    rSquared: '0.742',
    activeMonths: 10,
  },
  recurringProfiles: [
    {
      merchant: 'Stream Box',
      cadence: 'monthly',
      occurrenceCount: 8,
      medianAmount: '20.00',
      medianIntervalDays: '30.0',
      intervalRegularity: '0.967',
      amountStability: '0.990',
      cadenceFit: '1.000',
      historyDepth: '1.000',
      patternScore: '98.0',
      nextExpectedDate: '2026-07-30',
    },
  ],
  outliers: [
    {
      transactionId: 'tx-1',
      merchant: 'Cloud Tools',
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
    },
  ],
  coverage: {
    transactionCount: 42,
    activeMonths: 10,
    merchantsWithBaseline: 4,
    categoriesWithBaseline: 3,
    recurringProfiles: 1,
    outlierCount: 1,
  },
};

describe('HistoricalAnalysisPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLatestHistoricalAnalysis).mockResolvedValue(analysis);
    vi.mocked(runHistoricalAnalysis).mockResolvedValue(analysis);
  });

  it('renders persisted statistical evidence without calling scores probabilities', async () => {
    render(<HistoricalAnalysisPanel />);

    expect(await screen.findByText('Behavior over time')).toBeInTheDocument();
    expect(screen.getByText('Increasing')).toBeInTheDocument();
    expect(screen.getByText('Stream Box')).toBeInTheDocument();
    expect(screen.getByText('98.0')).toBeInTheDocument();
    expect(screen.getByText('Cloud Tools')).toBeInTheDocument();
    expect(screen.getByText(/baseline €10\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/Deterministic 0–100 pattern index; not a probability/i)).toBeInTheDocument();
  });

  it('runs a new 12-month snapshot and replaces the displayed analysis', async () => {
    render(<HistoricalAnalysisPanel />);
    await screen.findByText('Stream Box');

    fireEvent.click(screen.getByRole('button', { name: 'Run 12-month analysis' }));

    await waitFor(() => expect(runHistoricalAnalysis).toHaveBeenCalledWith(12));
  });
});
