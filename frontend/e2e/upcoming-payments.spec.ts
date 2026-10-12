import { expect, test } from '@playwright/test';


function localDateDaysAgo(days: number): string {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() - days);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


test('recurring transaction history becomes an explainable upcoming-payments calendar', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-recurring-${unique}@example.com`;
  const password = 'playwright-secure-password';
  const merchant = `Weekly Cloud ${unique}`;

  await page.goto('/register');
  await page.getByLabel('Nombre').fill('Recurring Calendar User');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();

  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByRole('heading', { name: 'Movimientos' })).toBeVisible();
  const form = page.getByRole('form', { name: 'Add transaction form' });
  const categorySelect = form.getByRole('combobox', { name: 'Category', exact: true });
  await expect(categorySelect).toHaveValue('Food');

  for (const daysAgo of [28, 21, 14, 7]) {
    await form.getByLabel('Merchant').fill(merchant);
    await form.getByLabel('Amount').fill('10.99');
    await form.getByLabel('Description').fill(`Recurring calendar occurrence ${daysAgo}`);
    await form.getByLabel('Date').fill(localDateDaysAgo(daysAgo));
    await categorySelect.selectOption({ label: 'Subscriptions' });
    await form.getByRole('button', { name: 'Add transaction' }).click();

    await expect(page.getByRole('status')).toContainText('Movimiento guardado.');
    await expect(form.getByLabel('Merchant')).toHaveValue('');
    await expect(form.getByRole('button', { name: 'Add transaction' })).toBeEnabled();
  }

  await page.getByRole('link', { name: 'Predicciones' }).click();
  await expect(page.getByRole('heading', { name: 'Predicciones' })).toBeVisible();

  const calendar = page.getByRole('region', { name: 'Upcoming recurring payment calendar' });
  await expect(calendar.getByText(merchant)).toHaveCount(5);
  await expect(calendar.getByText('Expected')).toHaveCount(5);
  await expect(page.getByText('Expected next 30 days').locator('..')).toContainText('€54.95');
  await expect(page.getByText('Overdue schedules').locator('..')).toContainText('0');
});
