import type { CsvColumnMapping, CsvDetectResponse, CsvImportOptions, CsvImportPayload, CsvPreviewResponse } from '@smart-expense-ai/api-contracts';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from '../../ui/primitives';
import { useCachedServerResource } from '../../api/useCachedServerResource';
import { useOnlineAction } from '../../api/useOnlineAction';
import { ChoiceField } from '../../components/ChoiceField';
import { DataFreshness } from '../../components/DataFreshness';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import { PAYMENT_METHODS } from '../transactions/TransactionEditor';
import { importApi, validateImportFile } from './importApi';

const DEFAULT_OPTIONS: CsvImportOptions = { dateFormat: 'auto', decimalSeparator: 'auto', amountConvention: 'negative_expense', defaultType: 'expense', defaultPaymentMethod: 'bank_transfer' };
const FIELDS: { key: keyof CsvColumnMapping; label: string; required?: boolean }[] = [
  { key: 'date', label: 'Date column', required: true }, { key: 'amount', label: 'Amount column', required: true },
  { key: 'merchant', label: 'Merchant column', required: true }, { key: 'description', label: 'Description column' },
  { key: 'category', label: 'Category column' }, { key: 'type', label: 'Income / expense column' },
  { key: 'currency', label: 'Currency column' }, { key: 'paymentMethod', label: 'Payment method column' },
];
export function ImportScreen() {
  const action = useOnlineAction();
  const loader = useCallback(() => importApi.batches(), []);
  const history = useCachedServerResource('server:import-batches:v1', loader);
  const [file, setFile] = useState<{ filename: string; content: string } | null>(null);
  const [detected, setDetected] = useState<CsvDetectResponse | null>(null);
  const [mapping, setMapping] = useState<CsvColumnMapping | null>(null);
  const [options, setOptions] = useState<CsvImportOptions>(DEFAULT_OPTIONS);
  const [preview, setPreview] = useState<CsvPreviewResponse | null>(null);
  const [previewPayload, setPreviewPayload] = useState<CsvImportPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const execute = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null); setMessage(null);
    try { await operation(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to import CSV'); }
    finally { setBusy(false); }
  };
  const selectFile = () => execute(async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain', 'application/vnd.ms-excel'], copyToCacheDirectory: true, multiple: false });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset) throw new Error('No file was selected');
    const copy = new File(asset.uri);
    try {
      if ((asset.size ?? copy.size) > 2_000_000) throw new Error('Choose a CSV smaller than 2 MB');
      const content = await copy.text();
      validateImportFile(asset.name, content);
      const selected = { filename: asset.name, content };
      const result = await action.run(() => importApi.detect(selected));
      setFile(selected); setDetected(result);
      setMapping({ ...result.suggestedMapping, date: result.suggestedMapping.date ?? '', amount: result.suggestedMapping.amount ?? '', merchant: result.suggestedMapping.merchant ?? '' });
      setOptions(DEFAULT_OPTIONS); setPreview(null); setPreviewPayload(null);
    } finally {
      // Only delete the private picker copy, never the user's original document.
      if (copy.uri.startsWith(Paths.cache.uri) && copy.exists) copy.delete();
    }
  });
  const changeMapping = (key: keyof CsvColumnMapping, value: string) => {
    setMapping((current) => current ? { ...current, [key]: value || (['date', 'amount', 'merchant'].includes(key) ? '' : null) } : null);
    setPreview(null); setPreviewPayload(null);
  };
  const changeOptions = (value: Partial<CsvImportOptions>) => { setOptions({ ...options, ...value }); setPreview(null); setPreviewPayload(null); };
  const buildPreview = () => execute(async () => {
    if (!file || !mapping?.date || !mapping.amount || !mapping.merchant) throw new Error('Choose the date, amount and merchant columns');
    const payload = { ...file, mapping, options };
    const result = await action.run(() => importApi.preview(payload));
    setPreview(result); setPreviewPayload(payload);
  });
  const commit = () => execute(async () => {
    if (!previewPayload || !preview || preview.validRows === 0 || preview.invalidRows > 0) return;
    const result = await action.run(() => importApi.commit(previewPayload));
    setMessage(`Imported ${result.importedCount} transactions. Skipped ${result.duplicatesSkipped} duplicates.`);
    setFile(null); setDetected(null); setMapping(null); setPreview(null); setPreviewPayload(null);
    // Commit is already durable on the server; a failed pull must not be presented as a failed import.
    await action.syncNow().catch(() => undefined);
    await history.refresh().catch(() => undefined);
  });
  return <ServerWorkspaceShell active="imports" title="Import CSV" subtitle="Choose a statement, check its columns, then preview before importing."
    isRefreshing={history.isRefreshing} onRefresh={() => void history.refresh().catch(() => undefined)}>
    {!action.hasNetwork ? <Text style={s.metadata}>Connect to import. Your previous import history remains available below.</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy || !action.hasNetwork} onPress={() => void selectFile()} style={s.primaryButton}><Text style={s.primaryButtonText}>Choose CSV file</Text></Pressable>
    {busy ? <ActivityIndicator /> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {message ? <Text accessibilityRole="alert" style={s.body}>{message}</Text> : null}
    {file && detected && mapping ? <View style={s.section}>
      <Text style={s.sectionTitle}>{file.filename}</Text>
      <Text style={s.metadata}>Match your statement columns. Optional columns can be left unselected.</Text>
      {FIELDS.map(({ key, label, required }) => <ChoiceField key={key} label={`${label}${required ? ' *' : ''}`} value={mapping[key] ?? ''}
        options={[{ value: '', label: required ? 'Choose a column' : 'Not included' }, ...detected.headers.map((header) => ({ value: header, label: header }))]}
        onChange={(value) => changeMapping(key, value)} disabled={busy} />)}
      <ChoiceField<CsvImportOptions['dateFormat']> label="Date format" value={options.dateFormat} options={[
        { value: 'auto', label: 'Detect automatically' }, { value: 'yyyy-mm-dd', label: 'Year-month-day' }, { value: 'dd/mm/yyyy', label: 'Day/month/year' },
        { value: 'mm/dd/yyyy', label: 'Month/day/year' }, { value: 'dd-mm-yyyy', label: 'Day-month-year' },
      ]} onChange={(dateFormat) => changeOptions({ dateFormat })} disabled={busy} />
      <ChoiceField<CsvImportOptions['decimalSeparator']> label="Decimals" value={options.decimalSeparator} options={[{ value: 'auto', label: 'Detect automatically' }, { value: 'dot', label: 'Dot: 12.50' }, { value: 'comma', label: 'Comma: 12,50' }]}
        onChange={(decimalSeparator) => changeOptions({ decimalSeparator })} disabled={busy} />
      <ChoiceField<CsvImportOptions['amountConvention']> label="Amount convention" value={options.amountConvention} options={[{ value: 'negative_expense', label: 'Negative amounts are expenses' }, { value: 'positive_expense', label: 'Positive amounts are expenses' }, { value: 'explicit_type', label: 'Use income / expense column' }]}
        onChange={(amountConvention) => changeOptions({ amountConvention })} disabled={busy} />
      <ChoiceField<CsvImportOptions['defaultType']> label="Default type" value={options.defaultType} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} onChange={(defaultType) => changeOptions({ defaultType })} disabled={busy} />
      <ChoiceField<CsvImportOptions['defaultPaymentMethod']> label="Default payment method" value={options.defaultPaymentMethod} options={PAYMENT_METHODS} onChange={(defaultPaymentMethod) => changeOptions({ defaultPaymentMethod })} disabled={busy} />
      <Pressable accessibilityRole="button" disabled={busy || !action.hasNetwork} style={s.primaryButton} onPress={() => void buildPreview()}><Text style={s.primaryButtonText}>Preview import</Text></Pressable>
    </View> : null}
    {preview ? <View style={s.section}>
      <Text style={s.sectionTitle}>Review before importing</Text>
      <Text style={s.body}>{preview.validRows} ready · {preview.duplicateRows} duplicates · {preview.invalidRows} invalid · {preview.rowsTotal} total</Text>
      {preview.previewRows.map((row) => <View key={row.rowNumber} style={s.card}>
        <Text style={s.cardTitle}>Row {row.rowNumber} · {row.status}</Text>
        {row.transaction ? <Text style={s.body}>{row.transaction.date} · {row.transaction.merchant} · {row.transaction.amount} {row.transaction.currency} · {row.transaction.type}</Text> : null}
        {row.errors.map((text) => <Text key={text} style={s.error}>{text}</Text>)}
      </View>)}
      {preview.previewTruncated ? <Text style={s.metadata}>This is a sample. The totals cover the entire file.</Text> : null}
      <Text style={s.metadata}>Duplicates are skipped. Fix every invalid row in the original file and select it again before importing.</Text>
      <Pressable accessibilityRole="button" disabled={busy || !action.hasNetwork || preview.validRows === 0 || preview.invalidRows > 0} style={s.primaryButton} onPress={() => void commit()}><Text style={s.primaryButtonText}>Import {preview.validRows} transactions</Text></Pressable>
    </View> : null}
    <Text style={s.sectionTitle}>Recent imports</Text>
    <DataFreshness cachedAt={history.cachedAt} isCachedFallback={history.isCachedFallback} />
    {history.error ? <Text style={s.metadata}>{history.error}</Text> : null}
    {history.data?.items.map((batch) => <View key={batch.id} style={s.card}><Text style={s.cardTitle}>{batch.filename}</Text>
      <Text style={s.body}>{batch.rowsImported} imported · {batch.duplicatesSkipped} duplicates skipped</Text><Text style={s.metadata}>{new Date(batch.createdAt).toLocaleString()}</Text></View>)}
  </ServerWorkspaceShell>;
}
