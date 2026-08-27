import { expect, test } from '@playwright/test';


test('authenticated user can create a custom category and monthly category budget', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-budget-${unique}@example.com`;
  const password = 'playwright-secure-password';
  const category = `Gym ${unique}`;

  await page.goto('/register');
  await page.getByLabel('Display name').fill('Budget Playwright Owner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Categories' }).click();
  await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
  await page.getByLabel('Category name').fill(category);
  await page.getByLabel('Category type').selectOption('expense');
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByRole('status')).toContainText('Category created.');
  await expect(page.getByRole('heading', { name: category })).toBeVisible();

  await page.getByRole('link', { name: 'Budgets' }).click();
  await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible();
  await page.getByLabel('Budget month').fill('2026-08');
  await page.getByLabel('Budget scope').selectOption({ label: category });
  await page.getByLabel('Budget limit').fill('400');
  await page.getByRole('button', { name: 'Create budget' }).click();
  await expect(page.getByRole('status')).toContainText('Budget created.');

  const budgetCard = page.getByRole('article').filter({ hasText: category });
  await expect(budgetCard).toBeVisible();
  await expect(budgetCard).toContainText(category);
  await expect(budgetCard).toContainText('/ €400.00');
  await expect(budgetCard.getByText('€400.00 remaining', { exact: true })).toBeVisible();
});
