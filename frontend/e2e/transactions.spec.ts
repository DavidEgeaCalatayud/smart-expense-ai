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
  await page.getByLabel('Display name').fill('Playwright Owner');
  await page.getByLabel('Email').fill(firstEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await expect(page.getByLabel('Category').first()).toHaveValue('Food');

  await page.getByLabel('Merchant').fill(merchant);
  await page.getByRole('spinbutton', { name: 'Amount' }).fill('42.50');
  await page.getByLabel('Description').fill('Authenticated critical E2E transaction');
  await page.getByLabel('Date').fill(transactionDate);
  await page.getByRole('button', { name: 'Add transaction' }).click();

  let row = page.getByRole('row').filter({ hasText: merchant });
  await expect(row).toContainText('€42.50');
  await expect(page.getByRole('status')).toContainText('Transaction created successfully.');

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();
  const dashboardRow = page.getByRole('row').filter({ hasText: merchant });
  await expect(dashboardRow).toContainText('€42.50');
  const expenseMetric = page.getByText('Expenses this month', { exact: true }).locator('..');
  await expect(expenseMetric).toContainText('€42.50');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('link', { name: 'Create an account' }).click();

  await page.getByLabel('Display name').fill('Second Playwright User');
  await page.getByLabel('Email').fill(secondEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await expect(page.getByTestId('transactions-empty-state')).toBeVisible();
  await expect(page.getByText(merchant)).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Email').fill(firstEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();

  row = page.getByRole('row').filter({ hasText: merchant });
  await expect(row).toContainText('€42.50');
  await row.getByRole('button', { name: `Edit ${merchant}` }).click();
  await page.getByRole('spinbutton', { name: 'Amount' }).fill('150.25');
  await page.getByRole('button', { name: 'Save changes' }).click();

  row = page.getByRole('row').filter({ hasText: merchant });
  await expect(row).toContainText('€150.25');
  await expect(row).toContainText('Needs review');

  await row.getByRole('button', { name: `Delete ${merchant}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete transaction?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete transaction' }).click();
  await expect(page.getByRole('row').filter({ hasText: merchant })).toHaveCount(0);
  await expect(page.getByTestId('transactions-empty-state')).toBeVisible();
});
