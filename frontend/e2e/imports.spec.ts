import { expect, test } from '@playwright/test';


test('authenticated user can preview, import and safely re-import a CSV statement', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-csv-${unique}@example.com`;
  const password = 'playwright-secure-password';
  const merchant = `CSV Market ${unique}`;
  const csv = [
    'Fecha;Concepto;Importe;Referencia;Moneda',
    `24/08/2026;${merchant};-42,51;Imported E2E movement;EUR`,
    `25/08/2026;CSV Employer ${unique};1500,00;Imported salary;EUR`,
  ].join('\n');

  await page.goto('/register');
  await page.getByLabel('Display name').fill('CSV Playwright Owner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Import CSV' }).click();
  await expect(page.getByRole('heading', { name: 'Import transactions from CSV' })).toBeVisible();

  const csvInput = page.getByLabel('CSV file');
  await csvInput.setInputFiles({
    name: 'playwright-statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });

  await expect(page.getByLabel('Date column')).toHaveValue('Fecha');
  await expect(page.getByLabel('Amount column')).toHaveValue('Importe');
  await expect(page.getByLabel('Merchant / concept column')).toHaveValue('Concepto');
  await page.getByLabel('Date format').selectOption('dd/mm/yyyy');
  await page.getByLabel('Decimal separator').selectOption('comma');

  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByText('Ready to import')).toBeVisible();
  await expect(page.getByText(merchant)).toBeVisible();
  await expect(page.getByText('€42.51')).toBeVisible();
  await expect(page.getByText('2 new rows are ready. 0 duplicate rows will be skipped and recorded in the import batch.')).toBeVisible();

  await page.getByRole('button', { name: 'Import 2 transactions' }).click();
  await expect(page.getByRole('status')).toContainText('2 transactions imported. 0 duplicates skipped.');
  await expect(page.getByRole('article').getByText('playwright-statement.csv')).toBeVisible();

  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  const importedRow = page.getByRole('row').filter({ hasText: merchant });
  await expect(importedRow).toContainText('€42.51');
  await expect(importedRow).toContainText('Other');

  await page.getByRole('link', { name: 'Import CSV' }).click();
  await expect(page.getByRole('heading', { name: 'Import transactions from CSV' })).toBeVisible();
  await csvInput.setInputFiles({
    name: 'playwright-statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByLabel('Date format').selectOption('dd/mm/yyyy');
  await page.getByLabel('Decimal separator').selectOption('comma');
  await page.getByRole('button', { name: 'Preview import' }).click();

  const duplicateOnlyImport = page.getByRole('button', { name: 'Import 0 transactions' });
  await expect(duplicateOnlyImport).toBeEnabled();
  await expect(page.getByText('0 new rows are ready. 2 duplicate rows will be skipped and recorded in the import batch.')).toBeVisible();
  await duplicateOnlyImport.click();
  await expect(page.getByRole('status')).toContainText('No new transactions imported. 2 duplicates were already present.');

  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: merchant })).toHaveCount(1);
});
