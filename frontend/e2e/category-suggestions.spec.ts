import { expect, test } from '@playwright/test';


test('user can correct an AI suggestion and reuse that merchant preference', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-suggestion-${unique}@example.com`;
  const password = 'playwright-secure-password';
  const customCategory = `Groceries ${unique}`;

  await page.goto('/register');
  await page.getByLabel('Nombre').fill('Suggestion Playwright Owner');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();

  await page.getByRole('link', { name: 'Categorías' }).click();
  await page.getByLabel('Nombre de categoría').fill(customCategory);
  await page.getByLabel('Tipo de categoría').selectOption('expense');
  await page.getByRole('button', { name: 'Crear categoría' }).click();
  await expect(page.getByRole('status')).toContainText('Categoría creada.');

  await page.getByRole('link', { name: 'Movimientos' }).click();
  const transactionForm = page.getByRole('form', { name: 'Formulario para añadir movimiento' });
  await expect(transactionForm).toBeVisible();
  const categorySelect = transactionForm.getByRole('combobox', { name: 'Categoría', exact: true });
  await expect(categorySelect).toHaveValue('Food');

  await transactionForm.getByLabel('Comercio').fill('MERCADONA 3921');
  await transactionForm.getByRole('button', { name: 'Sugerir categoría' }).click();

  let suggestion = transactionForm.getByRole('region', { name: 'Sugerencia de categoría' });
  await expect(suggestion).toContainText('Food');
  await expect(suggestion).not.toContainText(/confidence/i);
  await suggestion.getByRole('button', { name: 'Cambiar' }).click();
  await categorySelect.selectOption({ label: customCategory });
  await transactionForm.getByLabel('Importe').fill('25.00');
  await transactionForm.getByRole('button', { name: 'Añadir movimiento' }).click();
  await expect(page.getByRole('status')).toContainText('Movimiento guardado.');
  await expect(transactionForm.getByLabel('Comercio')).toHaveValue('');
  await expect(transactionForm.getByRole('button', { name: 'Añadir movimiento' })).toBeEnabled();

  await transactionForm.getByLabel('Comercio').fill('Mercadona 9999');
  await transactionForm.getByRole('button', { name: 'Sugerir categoría' }).click();
  suggestion = transactionForm.getByRole('region', { name: 'Sugerencia de categoría' });
  await expect(suggestion).toContainText(customCategory);
  await expect(suggestion).toContainText('Basado en cómo clasificaste este comercio anteriormente.');
  await expect(categorySelect).toHaveValue('Food');

  await suggestion.getByRole('button', { name: 'Aceptar' }).click();
  await expect(categorySelect).toHaveValue(customCategory);
});
