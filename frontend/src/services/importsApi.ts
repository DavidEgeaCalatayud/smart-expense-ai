import type {
  CsvCommitResponse,
  CsvDetectResponse,
  CsvImportPayload,
  CsvPreviewResponse,
  ImportBatchPage,
} from '../types/imports';
import { apiFetch } from './apiClient';

export function detectCsv(filename: string, content: string): Promise<CsvDetectResponse> {
  return apiFetch<CsvDetectResponse>('/imports/csv/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, content }),
  }, 'v2');
}

export function previewCsvImport(payload: CsvImportPayload): Promise<CsvPreviewResponse> {
  return apiFetch<CsvPreviewResponse>('/imports/csv/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'v2');
}

export function commitCsvImport(payload: CsvImportPayload): Promise<CsvCommitResponse> {
  return apiFetch<CsvCommitResponse>('/imports/csv/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'v2');
}

export function fetchImportBatches(): Promise<ImportBatchPage> {
  return apiFetch<ImportBatchPage>('/imports/batches?limit=20', {}, 'v2');
}
