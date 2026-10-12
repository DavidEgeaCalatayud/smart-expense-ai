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
  await page.getByLabel('Nombre').fill('CSV Playwright Owner');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();

  await page.getByRole('link', { name: 'Importar CSV' }).click();
  await expect(page.getByRole('heading', { name: 'Importar movimientos desde CSV' })).toBeVisible();

  const csvInput = page.getByLabel('Archivo CSV');
  await csvInput.setInputFiles({
    name: 'playwright-statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });

  await expect(page.getByLabel('Columna Fecha')).toHaveValue('Fecha');
  await expect(page.getByLabel('Columna Importe')).toHaveValue('Importe');
  await expect(page.getByLabel('Columna Comercio / concepto')).toHaveValue('Concepto');
  await page.getByLabel('Formato de fecha').selectOption('dd/mm/yyyy');
  await page.getByLabel('Separador decimal').selectOption('comma');

  await page.getByRole('button', { name: 'Ver vista previa' }).click();
  await expect(page.getByText('Listo para importar')).toBeVisible();
  await expect(page.getByText(merchant)).toBeVisible();
  await expect(page.getByText('€42.51')).toBeVisible();
  await expect(page.getByText('2 filas nuevas listas. 0 duplicados se omitirán.')).toBeVisible();

  await page.getByRole('button', { name: 'Importar 2 movimientos' }).click();
  await expect(page.getByRole('status')).toContainText('2 movimientos importados. 0 duplicados omitidos.');
  await expect(page.getByRole('article').getByText('playwright-statement.csv')).toBeVisible();

  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();
  const importedRow = page.getByRole('row').filter({ hasText: merchant });
  await expect(importedRow).toContainText('€42.51');
  await expect(importedRow).toContainText('Other');

  await page.getByRole('link', { name: 'Importar CSV' }).click();
  await expect(page.getByRole('heading', { name: 'Importar movimientos desde CSV' })).toBeVisible();
  await csvInput.setInputFiles({
    name: 'playwright-statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  });
  await page.getByLabel('Formato de fecha').selectOption('dd/mm/yyyy');
  await page.getByLabel('Separador decimal').selectOption('comma');
  await page.getByRole('button', { name: 'Ver vista previa' }).click();

  const duplicateOnlyImport = page.getByRole('button', { name: 'Importar 0 movimientos' });
  await expect(duplicateOnlyImport).toBeEnabled();
  await expect(page.getByText('0 filas nuevas listas. 2 duplicados se omitirán.')).toBeVisible();
  await duplicateOnlyImport.click();
  await expect(page.getByRole('status')).toContainText('No se han importado movimientos nuevos. 2 duplicados ya estaban registrados.');

  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: merchant })).toHaveCount(1);
});
