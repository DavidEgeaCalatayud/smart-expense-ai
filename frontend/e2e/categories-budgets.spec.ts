import { expect, test } from '@playwright/test';


test('authenticated user can create a custom category and monthly category budget', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-budget-${unique}@example.com`;
  const password = 'playwright-secure-password';
  const category = `Gym ${unique}`;

  await page.goto('/register');
  await page.getByLabel('Nombre').fill('Budget Playwright Owner');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Tu visión financiera' })).toBeVisible();

  await page.getByRole('link', { name: 'Categorías' }).click();
  await expect(page.getByRole('heading', { name: 'Categorías' })).toBeVisible();
  await page.getByLabel('Category name').fill(category);
  await page.getByLabel('Category type').selectOption('expense');
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByRole('status')).toContainText('Categoría creada.');
  await expect(page.getByRole('heading', { name: category })).toBeVisible();

  await page.getByRole('link', { name: 'Presupuestos' }).click();
  await expect(page.getByRole('heading', { name: 'Presupuestos' })).toBeVisible();
  await page.getByLabel('Mes del presupuesto').fill('2026-08');
  await page.getByLabel('Ámbito del presupuesto').selectOption({ label: category });
  await page.getByLabel('Límite del presupuesto').fill('400');
  await page.getByRole('button', { name: 'Crear presupuesto' }).click();
  await expect(page.getByRole('status')).toContainText('Presupuesto creado.');

  const budgetCard = page.getByRole('article').filter({ hasText: category });
  await expect(budgetCard).toBeVisible();
  await expect(budgetCard).toContainText(category);
  await expect(budgetCard).toContainText('/ €400.00');
  await expect(budgetCard.getByText('€400.00 restantes', { exact: true })).toBeVisible();
});
