import { MobileApiClient } from '../src/api/client';
import { ServerDerivedApi } from '../src/api/serverDerivedApi';

describe('ServerDerivedApi', () => {
  it('does not request premium workspaces for an account without enabled access', async () => {
    const api = client();
    const request = jest.spyOn(MobileApiClient.prototype, 'request').mockResolvedValue({
      planTier: 'free', features: { exportableReports: { enabled: false }, advancedInsights: { enabled: false } },
    });
    expect((await api.getReportsWorkspace('2026-09')).report).toBeNull();
    expect((await api.getInsightsWorkspace('2026-09')).insights).toBeNull();
    expect(request.mock.calls.map(([path]) => path)).toEqual(['/api/v2/entitlements', '/api/v2/entitlements']);
  });

  it('propagates an entitlement lookup failure instead of claiming the user has a free plan', async () => {
    const failure = new Error('Entitlements unavailable');
    jest.spyOn(MobileApiClient.prototype, 'request').mockRejectedValue(failure);
    await expect(client().getReportsWorkspace('2026-09')).rejects.toBe(failure);
  });

  it('loads authorized report and insights contracts and preserves the server CSV', async () => {
    const request = jest.spyOn(MobileApiClient.prototype, 'request')
      .mockResolvedValueOnce({ features: { exportableReports: { enabled: true } } })
      .mockResolvedValueOnce({ month: '2026-09', totalIncome: '12.34' })
      .mockResolvedValueOnce({ features: { advancedInsights: { enabled: true } } })
      .mockResolvedValueOnce({ month: '2026-09', insights: [] });
    const text = jest.spyOn(MobileApiClient.prototype, 'requestText').mockResolvedValue('category,total\r\nFood,12.34\r\n');
    const api = client();
    expect((await api.getReportsWorkspace('2026-09')).report?.totalIncome).toBe('12.34');
    expect((await api.getInsightsWorkspace('2026-09')).insights?.month).toBe('2026-09');
    expect(await api.getMonthlyReportCsv('2026-09')).toBe('category,total\r\nFood,12.34\r\n');
    expect(request.mock.calls.map(([path]) => path)).toEqual(['/api/v2/entitlements',
      '/api/v2/reports/monthly?month=2026-09', '/api/v2/entitlements', '/api/v2/insights/advanced?month=2026-09']);
    expect(text).toHaveBeenCalledWith('/api/v2/reports/monthly.csv?month=2026-09');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function client() {
    return new ServerDerivedApi(new MobileApiClient('https://api.example.test'));
  }

  it('uses versioned dashboard endpoints without client-side financial recomputation', async () => {
    const request = jest.spyOn(MobileApiClient.prototype, 'request').mockResolvedValue({});
    const api = client();

    await api.getSummary();
    await api.getMonthlyExpenses(6);

    expect(request).toHaveBeenNthCalledWith(1, '/api/v2/analytics/summary');
    expect(request).toHaveBeenNthCalledWith(2, '/api/v2/analytics/monthly-expenses?months=6');
  });

  it('keeps intelligence actions on the server boundary', async () => {
    const request = jest.spyOn(MobileApiClient.prototype, 'request').mockResolvedValue({});
    const api = client();

    await api.getIntelligenceFindings({ status: 'open', type: 'spending_anomaly' });
    await api.runIntelligenceScan();
    await api.updateFindingStatus('finding/id', 'resolved');

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v2/intelligence/findings?status=open&type=spending_anomaly',
    );
    expect(request).toHaveBeenNthCalledWith(2, '/api/v2/intelligence/scan', { method: 'POST' });
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/api/v2/intelligence/findings/finding%2Fid',
      { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) },
    );
  });

  it('uses existing historical and prediction contracts', async () => {
    const request = jest.spyOn(MobileApiClient.prototype, 'request').mockResolvedValue({});
    const api = client();

    await api.runHistoricalAnalysis(12);
    await api.getLatestHistoricalAnalysis();
    await api.getUpcomingPayments(30);
    await api.getSpendingForecast('2026-08-31');

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v2/intelligence/historical-analysis?months=12',
      { method: 'POST' },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/v2/intelligence/historical-analysis/latest',
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/api/v2/intelligence/upcoming-payments?days=30',
    );
    expect(request).toHaveBeenNthCalledWith(
      4,
      '/api/v2/analytics/spending-forecast?asOf=2026-08-31',
    );
  });

  it('keeps suggestions advisory and trims only the transport input', async () => {
    const request = jest.spyOn(MobileApiClient.prototype, 'request').mockResolvedValue({});
    const api = client();

    await api.previewCategorySuggestion('  Mercadona  ', 'expense');

    expect(request).toHaveBeenCalledWith('/api/v2/category-suggestions/preview', {
      method: 'POST',
      body: JSON.stringify({ merchant: 'Mercadona', type: 'expense' }),
    });
  });

  it('keeps Financial Assistant stateless and evidence-server-backed', async () => {
    const request = jest.spyOn(MobileApiClient.prototype, 'request').mockResolvedValue({});
    const api = client();

    await api.queryAssistant('  Compare this month with last month  ');

    expect(request).toHaveBeenCalledWith('/api/v2/assistant/query', {
      method: 'POST',
      body: JSON.stringify({ question: 'Compare this month with last month' }),
    });
  });
});
