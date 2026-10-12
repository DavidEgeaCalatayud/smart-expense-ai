import { expect, test } from '@playwright/test';


test('free account sees the real Premium advanced-insights entitlement boundary', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-insights-${unique}@example.com`;
  const password = 'playwright-secure-password';

  await page.goto('/register');
  await page.getByLabel('Nombre').fill('Insights Playwright Owner');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();

  await page.getByRole('link', { name: 'Análisis' }).click();
  await expect(page.getByRole('heading', { name: 'Análisis avanzados' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Análisis avanzados Premium' })).toBeVisible();
  await expect(page.getByText(/no están incluidos actualmente en tu cuenta/i)).toBeVisible();
    await expect(page.getByLabel('Tarjetas de análisis avanzados')).toHaveCount(0);
});
