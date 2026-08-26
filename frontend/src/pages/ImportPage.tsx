import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  History,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { ApiErrorAlert } from '../components/ui/ApiErrorAlert';
import {
  commitCsvImport,
  detectCsv,
  fetchImportBatches,
  previewCsvImport,
} from '../services/importsApi';
import { getApiErrorPresentation, type ApiErrorPresentation } from '../services/apiClient';
import type {
  CsvColumnMapping,
  CsvDetectResponse,
  CsvImportOptions,
  CsvImportPayload,
  CsvPreviewResponse,
  ImportBatch,
} from '../types/imports';

const EMPTY_MAPPING: CsvColumnMapping = {
  date: '',
  amount: '',
  merchant: '',
  description: null,
  category: null,
  type: null,
  currency: null,
  paymentMethod: null,
};

const DEFAULT_OPTIONS: CsvImportOptions = {
  dateFormat: 'auto',
  decimalSeparator: 'auto',
  amountConvention: 'negative_expense',
  defaultType: 'expense',
  defaultPaymentMethod: 'bank_transfer',
};

const mappingFields: Array<{
  key: keyof CsvColumnMapping;
  label: string;
  required: boolean;
}> = [
  { key: 'date', label: 'Date', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'merchant', label: 'Merchant / concept', required: true },
  { key: 'description', label: 'Description / reference', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'type', label: 'Transaction type', required: false },
  { key: 'currency', label: 'Currency', required: false },
  { key: 'paymentMethod', label: 'Payment method', required: false },
];

function localError(message: string): ApiErrorPresentation {
  return {
    kind: 'validation',
    title: 'Check the CSV file',
    message,
    retryable: false,
  };
}

function MappingSelect({
  field,
  headers,
  value,
  onChange,
}: {
  field: (typeof mappingFields)[number];
  headers: string[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-semibold text-slate-700">
        {field.label}
        {!field.required && <span className="ml-1 font-normal text-slate-400">optional</span>}
      </span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        aria-label={`${field.label} column`}
      >
        <option value="">{field.required ? 'Select a column' : 'Not mapped'}</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' | 'slate' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-2xl font-bold text-slate-950">{value}</span>
        <Badge tone={tone}>{label}</Badge>
      </div>
    </div>
  );
}

function BatchHistory({ batches }: { batches: ImportBatch[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <History size={19} />
        </div>
        <div>
          <h2 className="font-bold text-slate-950">Import history</h2>
          <p className="text-sm text-slate-500">Auditable batches for this account only.</p>
        </div>
      </div>

      {batches.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No CSV imports yet.</p>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => (
            <article key={batch.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{batch.filename}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(batch.createdAt).toLocaleString()} · hash {batch.fileHash.slice(0, 12)}…
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="green">{batch.rowsImported} imported</Badge>
                  <Badge tone="amber">{batch.duplicatesSkipped} duplicates</Badge>
                  {batch.invalidRows > 0 && <Badge tone="red">{batch.invalidRows} invalid</Badge>}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function ImportPage() {
  const [fileData, setFileData] = useState<{ filename: string; content: string } | null>(null);
  const [detection, setDetection] = useState<CsvDetectResponse | null>(null);
  const [mapping, setMapping] = useState<CsvColumnMapping>(EMPTY_MAPPING);
  const [options, setOptions] = useState<CsvImportOptions>(DEFAULT_OPTIONS);
  const [preview, setPreview] = useState<CsvPreviewResponse | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  useEffect(() => {
    void fetchImportBatches()
      .then((response) => setBatches(response.items))
      .catch((caught) => setError(getApiErrorPresentation(caught, 'Unable to load import history.')));
  }, []);

  const mappingReady = Boolean(mapping.date && mapping.amount && mapping.merchant);
  const delimiterLabel = detection?.delimiter === '\t' ? 'Tab' : detection?.delimiter;

  const payload = useMemo<CsvImportPayload | null>(() => {
    if (!fileData || !mappingReady) return null;
    return {
      filename: fileData.filename,
      content: fileData.content,
      mapping,
      options,
    };
  }, [fileData, mapping, mappingReady, options]);

  const invalidatePreview = () => {
    setPreview(null);
    setCommitted(false);
    setSuccessMessage('');
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSuccessMessage('');
    setPreview(null);
    setCommitted(false);

    if (file.size > 2_000_000) {
      setError(localError('CSV files are limited to 2 MB in this import workflow.'));
      return;
    }

    const content = await file.text();
    setIsDetecting(true);
    try {
      const detected = await detectCsv(file.name, content);
      setFileData({ filename: file.name, content });
      setDetection(detected);
      setMapping({
        date: detected.suggestedMapping.date ?? '',
        amount: detected.suggestedMapping.amount ?? '',
        merchant: detected.suggestedMapping.merchant ?? '',
        description: detected.suggestedMapping.description ?? null,
        category: detected.suggestedMapping.category ?? null,
        type: detected.suggestedMapping.type ?? null,
        currency: detected.suggestedMapping.currency ?? null,
        paymentMethod: detected.suggestedMapping.paymentMethod ?? null,
      });
    } catch (caught) {
      setFileData(null);
      setDetection(null);
      setMapping(EMPTY_MAPPING);
      setError(getApiErrorPresentation(caught, 'Unable to inspect the CSV file.'));
    } finally {
      setIsDetecting(false);
    }
  };

  const handlePreview = async () => {
    if (!payload) return;
    setError(null);
    setSuccessMessage('');
    setIsPreviewing(true);
    try {
      setPreview(await previewCsvImport(payload));
      setCommitted(false);
    } catch (caught) {
      setError(getApiErrorPresentation(caught, 'Unable to preview the CSV import.'));
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!payload || !preview || preview.invalidRows > 0) return;
    setError(null);
    setIsCommitting(true);
    try {
      const result = await commitCsvImport(payload);
      setCommitted(true);
      setSuccessMessage(
        result.importedCount > 0
          ? `${result.importedCount} transactions imported. ${result.duplicatesSkipped} duplicates skipped.`
          : `No new transactions imported. ${result.duplicatesSkipped} duplicates were already present.`,
      );
      const history = await fetchImportBatches();
      setBatches(history.items);
    } catch (caught) {
      setError(getApiErrorPresentation(caught, 'Unable to commit the CSV import.'));
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-700">
            <FileSpreadsheet size={17} />
            Historical data ingestion
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Import transactions from CSV</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Detect bank columns, map them explicitly, normalize money and dates, preview every decision and import only after duplicate and validation checks.
          </p>
        </div>
        <Badge tone="brand">Transactional import</Badge>
      </header>

      {error && <ApiErrorAlert error={error} />}
      {successMessage && (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {successMessage}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <UploadCloud size={20} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">1. Upload and detect</h2>
                <p className="text-sm text-slate-500">UTF-8 CSV, up to 2 MB / 10,000 rows.</p>
              </div>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center transition hover:border-brand-300 hover:bg-brand-50/30">
              <UploadCloud className="mb-3 text-slate-400" size={28} />
              <span className="font-semibold text-slate-800">Choose a CSV statement</span>
              <span className="mt-1 text-xs text-slate-500">The browser reads the file locally before sending text to the authenticated API.</span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                aria-label="CSV file"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
            </label>

            {isDetecting && <p className="mt-4 text-sm font-medium text-brand-700">Detecting columns…</p>}
            {detection && fileData && (
              <div className="mt-4 rounded-2xl border border-slate-200 p-4 text-sm">
                <p className="font-semibold text-slate-900">{fileData.filename}</p>
                <p className="mt-1 text-slate-500">
                  Delimiter: <strong>{delimiterLabel}</strong> · {detection.headers.length} columns · hash {detection.fileHash.slice(0, 12)}…
                </p>
              </div>
            )}
          </div>

          {detection && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
              <div className="mb-5">
                <h2 className="font-bold text-slate-950">2. Map columns</h2>
                <p className="mt-1 text-sm text-slate-500">Required fields must be mapped explicitly; optional fields use safe defaults.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {mappingFields.map((field) => (
                  <MappingSelect
                    key={field.key}
                    field={field}
                    headers={detection.headers}
                    value={mapping[field.key]}
                    onChange={(value) => {
                      setMapping((current) => ({ ...current, [field.key]: value }));
                      invalidatePreview();
                    }}
                  />
                ))}
              </div>
              <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                Missing category defaults to <strong>Other</strong> for expenses and <strong>Salary</strong> for income. Unknown mapped categories are rejected rather than invented.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {detection && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
              <div className="mb-5">
                <h2 className="font-bold text-slate-950">3. Normalization rules</h2>
                <p className="mt-1 text-sm text-slate-500">Control ambiguous bank formats before validation.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="font-semibold text-slate-700">Date format</span>
                  <select
                    aria-label="Date format"
                    value={options.dateFormat}
                    onChange={(event) => {
                      setOptions((current) => ({ ...current, dateFormat: event.target.value as CsvImportOptions['dateFormat'] }));
                      invalidatePreview();
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <option value="auto">Auto (unambiguous EU/ISO)</option>
                    <option value="yyyy-mm-dd">YYYY-MM-DD</option>
                    <option value="dd/mm/yyyy">DD/MM/YYYY</option>
                    <option value="mm/dd/yyyy">MM/DD/YYYY</option>
                    <option value="dd-mm-yyyy">DD-MM-YYYY</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-semibold text-slate-700">Decimal separator</span>
                  <select
                    aria-label="Decimal separator"
                    value={options.decimalSeparator}
                    onChange={(event) => {
                      setOptions((current) => ({ ...current, decimalSeparator: event.target.value as CsvImportOptions['decimalSeparator'] }));
                      invalidatePreview();
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <option value="auto">Auto</option>
                    <option value="comma">Comma (42,51)</option>
                    <option value="dot">Dot (42.51)</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-semibold text-slate-700">Amount convention</span>
                  <select
                    aria-label="Amount convention"
                    value={options.amountConvention}
                    onChange={(event) => {
                      setOptions((current) => ({ ...current, amountConvention: event.target.value as CsvImportOptions['amountConvention'] }));
                      invalidatePreview();
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <option value="negative_expense">Negative = expense</option>
                    <option value="positive_expense">Positive = expense</option>
                    <option value="explicit_type">Use mapped type column</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-semibold text-slate-700">Default payment method</span>
                  <select
                    aria-label="Default payment method"
                    value={options.defaultPaymentMethod}
                    onChange={(event) => {
                      setOptions((current) => ({ ...current, defaultPaymentMethod: event.target.value as CsvImportOptions['defaultPaymentMethod'] }));
                      invalidatePreview();
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="card">Card</option>
                    <option value="direct_debit">Direct debit</option>
                    <option value="cash">Cash</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                CSV import currently accepts EUR only. Non-EUR rows are rejected so analytics never sum currencies without an FX conversion model.
              </div>

              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={!payload || isPreviewing}
                className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPreviewing ? 'Validating CSV…' : 'Preview import'}
              </button>
            </div>
          )}

          {preview && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6">
              <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-bold text-slate-950">4. Validate and import</h2>
                  <p className="mt-1 text-sm text-slate-500">Fingerprints compare this file with existing account history and with itself.</p>
                </div>
                <Badge tone={preview.invalidRows === 0 ? 'green' : 'red'}>
                  {preview.invalidRows === 0 ? 'Ready to import' : 'Fix invalid rows'}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <Metric label="Total" value={preview.rowsTotal} tone="slate" />
                <Metric label="Valid" value={preview.validRows} tone="green" />
                <Metric label="Duplicates" value={preview.duplicateRows} tone="amber" />
                <Metric label="Invalid" value={preview.invalidRows} tone="red" />
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Row</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Merchant</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.previewRows.map((row) => (
                      <tr key={row.rowNumber} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-500">{row.rowNumber}</td>
                        <td className="px-4 py-3">
                          {row.status === 'valid' && <Badge tone="green">Valid</Badge>}
                          {row.status === 'duplicate' && <Badge tone="amber">Duplicate</Badge>}
                          {row.status === 'invalid' && <Badge tone="red">Invalid</Badge>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.transaction?.date ?? '—'}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{row.transaction?.merchant ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-700">{row.transaction ? `€${row.transaction.amount}` : '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{row.transaction?.category ?? '—'}</td>
                        <td className="max-w-sm px-4 py-3 text-xs text-slate-500">
                          {row.errors.length > 0 ? row.errors.join('; ') : row.transaction?.description || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.previewTruncated && (
                <p className="mt-2 text-xs text-slate-400">Only the first 100 rows are displayed; validation counts cover the full file.</p>
              )}

              {preview.invalidRows > 0 ? (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <XCircle size={19} className="mt-0.5 shrink-0" />
                  <p>The commit is intentionally blocked. No valid rows will be partially written while invalid rows remain.</p>
                </div>
              ) : (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
                  <p>{preview.validRows} new rows are ready. {preview.duplicateRows} duplicate rows will be skipped and recorded in the import batch.</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleCommit()}
                disabled={preview.invalidRows > 0 || isCommitting || committed}
                className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCommitting ? 'Importing transactionally…' : committed ? 'Import completed' : `Import ${preview.validRows} transactions`}
              </button>
            </div>
          )}
        </div>
      </section>

      <BatchHistory batches={batches} />
    </div>
  );
}
