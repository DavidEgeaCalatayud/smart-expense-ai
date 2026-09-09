export type CsvDateFormat = 'auto' | 'yyyy-mm-dd' | 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'dd-mm-yyyy';
export type CsvDecimalSeparator = 'auto' | 'dot' | 'comma';
export type CsvAmountConvention = 'negative_expense' | 'positive_expense' | 'explicit_type';
export type CsvImportStatus = 'valid' | 'duplicate' | 'invalid';

export interface CsvColumnMapping {
  date: string;
  amount: string;
  merchant: string;
  description: string | null;
  category: string | null;
  type: string | null;
  currency: string | null;
  paymentMethod: string | null;
}

export interface CsvImportOptions {
  dateFormat: CsvDateFormat;
  decimalSeparator: CsvDecimalSeparator;
  amountConvention: CsvAmountConvention;
  defaultType: 'expense' | 'income';
  defaultPaymentMethod: 'card' | 'cash' | 'bank_transfer' | 'direct_debit';
}

export interface CsvDetectResponse {
  fileHash: string;
  delimiter: string;
  headers: string[];
  suggestedMapping: Record<keyof CsvColumnMapping, string | null>;
  sampleRows: Record<string, string>[];
}

export interface CsvNormalizedTransaction {
  date: string;
  merchant: string;
  description: string;
  amount: string;
  currency: string;
  category: string;
  type: 'expense' | 'income';
  paymentMethod: 'card' | 'cash' | 'bank_transfer' | 'direct_debit';
  fingerprint: string;
}

export interface CsvPreviewRow {
  rowNumber: number;
  status: CsvImportStatus;
  transaction: CsvNormalizedTransaction | null;
  errors: string[];
}

export interface CsvPreviewResponse {
  fileHash: string;
  delimiter: string;
  headers: string[];
  rowsTotal: number;
  validRows: number;
  duplicateRows: number;
  invalidRows: number;
  previewRows: CsvPreviewRow[];
  previewTruncated: boolean;
}

export interface ImportBatch {
  id: string;
  filename: string;
  fileHash: string;
  rowsTotal: number;
  rowsImported: number;
  duplicatesSkipped: number;
  invalidRows: number;
  createdAt: string;
}

export interface ImportBatchPage {
  items: ImportBatch[];
  total: number;
}

export interface CsvCommitResponse {
  batch: ImportBatch;
  importedCount: number;
  duplicatesSkipped: number;
}

export interface CsvImportPayload {
  filename: string;
  content: string;
  mapping: CsvColumnMapping;
  options: CsvImportOptions;
}
