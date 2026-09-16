import type { CsvCommitResponse, CsvDetectResponse, CsvImportPayload, CsvPreviewResponse, ImportBatchPage } from '@smart-expense-ai/api-contracts';
import { getSharedMobileApiClient } from '../../api/client';

export const importApi = {
  detect: (payload: { filename: string; content: string }) => getSharedMobileApiClient().request<CsvDetectResponse>('/api/v2/imports/csv/detect', { method: 'POST', body: JSON.stringify(payload) }),
  preview: (payload: CsvImportPayload) => getSharedMobileApiClient().request<CsvPreviewResponse>('/api/v2/imports/csv/preview', { method: 'POST', body: JSON.stringify(payload) }),
  commit: (payload: CsvImportPayload) => getSharedMobileApiClient().request<CsvCommitResponse>('/api/v2/imports/csv/commit', { method: 'POST', body: JSON.stringify(payload) }),
  batches: () => getSharedMobileApiClient().request<ImportBatchPage>('/api/v2/imports/batches?limit=20'),
};

export function validateImportFile(filename: string, content: string) {
  if (!filename.toLowerCase().endsWith('.csv')) throw new Error('Choose a .csv file');
  if (!content.trim() || content.length > 2_000_000) throw new Error('Choose a non-empty CSV smaller than 2 MB');
}
