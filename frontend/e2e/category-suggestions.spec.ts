import { expect, test } from '@playwright/test';


test('user can correct an AI suggestion and reuse that merchant preference', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-suggestion-${unique}@example.com`;
  const password = 'playwright-secure-password';
  const customCategory = `Groceries ${unique}`;

  await page.goto('/register');
  await page.getByLabel('Display name').fill('Suggestion Playwright Owner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Categories' }).click();
  await page.getByLabel('Category name').fill(customCategory);
  await page.getByLabel('Category type').selectOption('expense');
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByRole('status')).toContainText('Category created.');

  await page.getByRole('link', { name: 'Transactions' }).click();
  await page.getByLabel('Merchant').fill('MERCADONA 3921');
  await page.getByRole('button', { name: 'Suggest category' }).click();

  let suggestion = page.getByRole('region', { name: 'AI category suggestion' });
  await expect(suggestion).toContainText('Food');
  await expect(suggestion).not.toContainText(/confidence/i);
  await suggestion.getByRole('button', { name: 'Change' }).click();
  await page.getByLabel('Category').selectOption({ label: customCategory });
  await page.getByRole('spinbutton', { name: 'Amount' }).fill('25.00');
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await expect(page.getByRole('status')).toContainText('Transaction created successfully.');

  await page.getByLabel('Merchant').fill('Mercadona 9999');
  await page.getByRole('button', { name: 'Suggest category' }).click();
  suggestion = page.getByRole('region', { name: 'AI category suggestion' });
  await expect(suggestion).toContainText(customCategory);
  await expect(suggestion).toContainText('Based on how you categorized this merchant before.');
  await expect(page.getByLabel('Category')).toHaveValue('Food');

  await suggestion.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByLabel('Category')).toHaveValue(customCategory);
});
