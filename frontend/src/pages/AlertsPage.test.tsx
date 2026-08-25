import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchIntelligenceFindings,
  fetchIntelligenceSummary,
  runIntelligenceScan,
  updateIntelligenceFindingStatus,
} from '../services/intelligenceApi';
import type { IntelligenceFinding, IntelligenceSummary } from '../types/intelligence';
import { AlertsPage } from './AlertsPage';

vi.mock('../components/intelligence/HistoricalAnalysisPanel', () => ({
  HistoricalAnalysisPanel: () => <div>Historical analysis panel</div>,
}));

vi.mock('../services/intelligenceApi', () => ({
  fetchIntelligenceFindings: vi.fn(),
  fetchIntelligenceSummary: vi.fn(),
  runIntelligenceScan: vi.fn(),
  updateIntelligenceFindingStatus: vi.fn(),
}));

const summary: IntelligenceSummary = {
  openCount: 1,
  recurringCount: 1,
  missingRecurringCount: 0,
  duplicateSubscriptionCount: 0,
  anomalyCount: 0,
  amountAnomalyCount: 0,
  frequencyAnomalyCount: 0,
  dismissedCount: 0,
  resolvedCount: 0,
  lastScanAt: '2026-08-25T07:00:00Z',
  analyzedTransactions: 8,
  ruleVersion: 'rules-v2',
};

const finding: IntelligenceFinding = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'recurring_pattern',
  severity: 'info',
  status: 'open',
  title: 'Recurring pattern: StreamBox',
  explanation: 'Four charges follow a stable monthly stream.',
  evidence: {
    cadence: 'monthly',
    occurrenceCount: 4,
    patternScore: '92.4',
    medianAmount: '9.99',
    nextExpectedDate: '2026-08-30',
    streamCalendar: 'monthly:day-30',
  },
  ruleVersion: 'rules-v2',
  firstDetectedAt: '2026-08-25T07:00:00Z',
  lastDetectedAt: '2026-08-25T07:00:00Z',
  resolvedAt: null,
};

describe('AlertsPage financial intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchIntelligenceSummary).mockResolvedValue(summary);
    vi.mocked(fetchIntelligenceFindings).mockResolvedValue([finding]);
    vi.mocked(runIntelligenceScan).mockResolvedValue({
      scanId: 'scan-1',
      ruleVersion: 'rules-v2',
      analyzedTransactions: 8,
      detectedFindings: 1,
      scannedAt: '2026-08-25T07:05:00Z',
    });
    vi.mocked(updateIntelligenceFindingStatus).mockResolvedValue({ ...finding, status: 'dismissed' });
  });

  it('renders rules-v2 stream evidence and summary metrics', async () => {
    render(<AlertsPage />);

    expect(await screen.findByText('Recurring pattern: StreamBox')).toBeInTheDocument();
    expect(screen.getByText(/monthly.*4 occurrences.*score 92\.4\/100/i)).toBeInTheDocument();
    expect(screen.getByText(/median €9\.99/i)).toBeInTheDocument();
    expect(screen.getByText('Historical analysis panel')).toBeInTheDocument();
    expect(screen.getByText(/Anomalies: 0 amount · 0 frequency/i)).toBeInTheDocument();

    const openFindingsCard = screen.getByText('Open findings').closest('article');
    expect(openFindingsCard).not.toBeNull();
    expect(within(openFindingsCard as HTMLElement).getByText('1')).toBeInTheDocument();

    expect(fetchIntelligenceFindings).toHaveBeenCalledWith({ status: 'open' });
  });

  it('runs findings scan and refreshes persisted results', async () => {
    render(<AlertsPage />);
    await screen.findByText('Recurring pattern: StreamBox');

    fireEvent.click(screen.getByRole('button', { name: 'Run findings scan' }));

    await waitFor(() => expect(runIntelligenceScan).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Analysis completed: 1 findings from 8 expense transactions/i)).toBeInTheDocument();
    expect(fetchIntelligenceSummary).toHaveBeenCalledTimes(2);
  });

  it('persists review status changes through the API', async () => {
    render(<AlertsPage />);
    await screen.findByText('Recurring pattern: StreamBox');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() =>
      expect(updateIntelligenceFindingStatus).toHaveBeenCalledWith(finding.id, 'dismissed'),
    );
    expect(await screen.findByText('Finding marked as dismissed.')).toBeInTheDocument();
  });
});
