import { expect, test } from '@playwright/test';


test('authenticated users only see and mutate their own persisted transactions', async ({ page }) => {
  const now = new Date();
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const firstEmail = `playwright-owner-${unique}@example.com`;
  const secondEmail = `playwright-second-${unique}@example.com`;
  const password = 'playwright-secure-password';
  const transactionDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
  const merchant = `Playwright Market ${unique}`;

  await page.goto('/register');
  await page.getByLabel('Nombre').fill('Playwright Owner');
  await page.getByLabel('Correo electrónico').fill(firstEmail);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();

  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();
  await expect(page.getByLabel('Category').first()).toHaveValue('Food');

  await page.getByLabel('Merchant').fill(merchant);
  await page.getByLabel('Amount').fill('42.50');
  await page.getByLabel('Description').fill('Authenticated critical E2E transaction');
  await page.getByLabel('Date').fill(transactionDate);
  await page.getByRole('button', { name: 'Add transaction' }).click();

  let row = page.getByRole('row').filter({ hasText: merchant });
  await expect(row).toContainText('€42.50');
  await expect(page.getByRole('status')).toContainText('Movimiento guardado.');

  await page.getByRole('link', { name: 'Resumen' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();
  const dashboardRow = page.getByRole('row').filter({ hasText: merchant });
  await expect(dashboardRow).toContainText('€42.50');
  const expenseMetric = page.getByText('Gastos este mes', { exact: true }).locator('..');
  await expect(expenseMetric).toContainText('€42.50');

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await page.getByRole('link', { name: 'Crear cuenta' }).click();

  await page.getByLabel('Nombre').fill('Second Playwright User');
  await page.getByLabel('Correo electrónico').fill(secondEmail);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();
  await expect(page.getByTestId('transactions-empty-state')).toBeVisible();
  await expect(page.getByText(merchant)).toHaveCount(0);

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByLabel('Correo electrónico').fill(firstEmail);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();

  row = page.getByRole('row').filter({ hasText: merchant });
  await expect(row).toContainText('€42.50');
  await row.getByRole('button', { name: `Edit ${merchant}` }).click();
  await page.getByLabel('Amount').fill('150.25');
  await page.getByRole('button', { name: 'Save changes' }).click();

  row = page.getByRole('row').filter({ hasText: merchant });
  await expect(row).toContainText('€150.25');
  await expect(row).toContainText('Requiere revisión');

  await row.getByRole('button', { name: `Delete ${merchant}` }).click();
  const dialog = page.getByRole('dialog', { name: '¿Eliminar movimiento?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Eliminar movimiento' }).click();
  await expect(page.getByRole('row').filter({ hasText: merchant })).toHaveCount(0);
  await expect(page.getByTestId('transactions-empty-state')).toBeVisible();
});
