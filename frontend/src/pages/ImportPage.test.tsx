import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commitCsvImport,
  detectCsv,
  fetchImportBatches,
  previewCsvImport,
} from '../services/importsApi';
import { ImportPage } from './ImportPage';

vi.mock('../services/importsApi', () => ({
  commitCsvImport: vi.fn(),
  detectCsv: vi.fn(),
  fetchImportBatches: vi.fn(),
  previewCsvImport: vi.fn(),
}));

const detected = {
  fileHash: 'a'.repeat(64),
  delimiter: ';',
  headers: ['Fecha', 'Concepto', 'Importe', 'Referencia', 'Moneda'],
  suggestedMapping: {
    date: 'Fecha',
    amount: 'Importe',
    merchant: 'Concepto',
    description: 'Referencia',
    category: null,
    type: null,
    currency: 'Moneda',
    paymentMethod: null,
  },
  sampleRows: [
    {
      Fecha: '24/08/2026',
      Concepto: 'MERCADONA 1293',
      Importe: '-42,51',
      Referencia: 'Compra',
      Moneda: 'EUR',
    },
  ],
};

const validPreview = {
  fileHash: 'a'.repeat(64),
  delimiter: ';',
  headers: detected.headers,
  rowsTotal: 3,
  validRows: 2,
  duplicateRows: 1,
  invalidRows: 0,
  previewTruncated: false,
  previewRows: [
    {
      rowNumber: 2,
      status: 'valid' as const,
      errors: [],
      transaction: {
        date: '2026-08-24',
        merchant: 'MERCADONA 1293',
        description: 'Compra',
        amount: '42.51',
        currency: 'EUR',
        category: 'Other',
        type: 'expense' as const,
        paymentMethod: 'bank_transfer' as const,
        fingerprint: 'b'.repeat(64),
      },
    },
  ],
};

const batch = {
  id: '11111111-1111-4111-8111-111111111111',
  filename: 'statement.csv',
  fileHash: 'a'.repeat(64),
  rowsTotal: 3,
  rowsImported: 2,
  duplicatesSkipped: 1,
  invalidRows: 0,
  createdAt: '2026-08-26T10:00:00Z',
};

function csvFile(): File {
  const file = new File(['placeholder'], 'statement.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', {
    value: vi.fn().mockResolvedValue('Fecha;Concepto;Importe;Referencia;Moneda\n24/08/2026;MERCADONA 1293;-42,51;Compra;EUR'),
  });
  return file;
}

describe('ImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchImportBatches).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(detectCsv).mockResolvedValue(detected);
    vi.mocked(previewCsvImport).mockResolvedValue(validPreview);
    vi.mocked(commitCsvImport).mockResolvedValue({
      batch,
      importedCount: 2,
      duplicatesSkipped: 1,
    });
  });

  it('detects mappings, previews normalized rows and commits the reviewed file', async () => {
    render(<ImportPage />);

    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: { files: [csvFile()] },
    });

    await waitFor(() => expect(detectCsv).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Date column')).toHaveValue('Fecha');
    expect(screen.getByLabelText('Amount column')).toHaveValue('Importe');
    expect(screen.getByLabelText('Merchant / concept column')).toHaveValue('Concepto');

    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    await waitFor(() => expect(previewCsvImport).toHaveBeenCalledOnce());
    expect(screen.getByText('2 new rows are ready. 1 duplicate rows will be skipped and recorded in the import batch.')).toBeInTheDocument();
    expect(screen.getByText('MERCADONA 1293')).toBeInTheDocument();
    expect(screen.getByText('€42.51')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 transactions' }));
    await waitFor(() => expect(commitCsvImport).toHaveBeenCalledOnce());
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 transactions imported. 1 duplicates skipped.',
    );
    expect(fetchImportBatches).toHaveBeenCalledTimes(2);
  });

  it('blocks commit when preview contains invalid rows and invalidates stale previews after mapping changes', async () => {
    vi.mocked(previewCsvImport).mockResolvedValue({
      ...validPreview,
      validRows: 1,
      duplicateRows: 0,
      invalidRows: 1,
      previewRows: [
        validPreview.previewRows[0],
        {
          rowNumber: 3,
          status: 'invalid',
          transaction: null,
          errors: ['only EUR can be imported until multi-currency conversion is implemented'],
        },
      ],
    });

    render(<ImportPage />);
    fireEvent.change(screen.getByLabelText('CSV file'), {
      target: { files: [csvFile()] },
    });
    await waitFor(() => expect(detectCsv).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    await waitFor(() => expect(previewCsvImport).toHaveBeenCalledOnce());

    const commitButton = screen.getByRole('button', { name: 'Import 1 transactions' });
    expect(commitButton).toBeDisabled();
    expect(screen.getByText(/commit is intentionally blocked/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Description / reference column'), {
      target: { value: '' },
    });
    expect(screen.queryByRole('button', { name: 'Import 1 transactions' })).not.toBeInTheDocument();
    expect(commitCsvImport).not.toHaveBeenCalled();
  });
});
