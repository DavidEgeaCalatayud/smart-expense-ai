import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadMonthlyReport,
  fetchMonthlyReport,
  fetchReportEntitlements,
} from '../services/reportsApi';
import { ReportsPage } from './ReportsPage';

vi.mock('../services/reportsApi', () => ({
  fetchReportEntitlements: vi.fn(),
  fetchMonthlyReport: vi.fn(),
  downloadMonthlyReport: vi.fn(),
}));

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a truthful locked state for a free account without requesting report data', async () => {
    vi.mocked(fetchReportEntitlements).mockResolvedValue({
      policyVersion: 'premium-entitlements-v1',
      enforcementMode: 'observe_only',
      planTier: 'free',
      features: {
        exportableReports: { eligible: false, enabled: false },
      },
    });

    render(<ReportsPage />);

    expect(await screen.findByText('Premium report export')).toBeInTheDocument();
    expect(screen.getByText(/does not have this entitlement enabled/i)).toBeInTheDocument();
    expect(screen.getByText(/billing checkout is not yet exposed/i)).toBeInTheDocument();
    expect(fetchMonthlyReport).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Download CSV' })).not.toBeInTheDocument();
  });

  it('does not misrepresent an entitlement lookup failure as a free-plan lock', async () => {
    vi.mocked(fetchReportEntitlements).mockRejectedValue(new Error('network unavailable'));

    render(<ReportsPage />);

    expect(await screen.findByText('Unable to verify report access')).toBeInTheDocument();
    expect(screen.queryByText('Premium report export')).not.toBeInTheDocument();
    expect(screen.queryByText(/does not have this entitlement enabled/i)).not.toBeInTheDocument();
    expect(fetchMonthlyReport).not.toHaveBeenCalled();
  });

  it('renders exact premium totals and downloads the server CSV', async () => {
    vi.mocked(fetchReportEntitlements).mockResolvedValue({
      policyVersion: 'premium-entitlements-v1',
      enforcementMode: 'observe_only',
      planTier: 'premium',
      features: {
        exportableReports: { eligible: true, enabled: true },
      },
    });
    vi.mocked(fetchMonthlyReport).mockResolvedValue({
      reportVersion: 'monthly-financial-report-v1',
      month: '2026-09',
      currency: 'EUR',
      totalIncome: '1000.00',
      totalExpenses: '32.34',
      net: '967.66',
      transactionCount: 3,
      categoryBreakdown: [
        { category: 'Food', type: 'expense', total: '12.34', transactionCount: 1 },
        { category: 'Salary', type: 'income', total: '1000.00', transactionCount: 1 },
      ],
      downloadFilename: 'smart-expense-report-2026-09.csv',
    });
    vi.mocked(downloadMonthlyReport).mockResolvedValue({
      blob: new Blob(['report'], { type: 'text/csv' }),
      filename: 'smart-expense-report-2026-09.csv',
    });

    const createObjectURL = vi.fn(() => 'blob:report');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<ReportsPage />);

    const incomeCard = (await screen.findByText('Income')).closest('article');
    expect(incomeCard).not.toBeNull();
    expect(incomeCard).toHaveTextContent('€1,000.00');
    expect(screen.getByText('€32.34')).toBeInTheDocument();
    expect(screen.getByText('€967.66')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(await screen.findByText('Downloaded smart-expense-report-2026-09.csv.')).toBeInTheDocument();
    expect(downloadMonthlyReport).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}$/));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');

    click.mockRestore();
  });
});
