import { expect, test } from '@playwright/test';


test('free account sees the real Premium reports entitlement boundary', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-reports-${unique}@example.com`;
  const password = 'playwright-secure-password';

  await page.goto('/register');
  await page.getByLabel('Nombre').fill('Reports Playwright Owner');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();

  await page.getByRole('link', { name: 'Informes' }).click();
  await expect(page.getByRole('heading', { name: 'Informes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Exportación de informes Premium' })).toBeVisible();
  await expect(page.getByText(/no está incluida actualmente en tu cuenta/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descargar CSV' })).toHaveCount(0);
});
