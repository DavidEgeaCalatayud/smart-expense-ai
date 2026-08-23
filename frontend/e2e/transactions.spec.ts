import { expect, test, type APIRequestContext } from '@playwright/test';


const API_BASE_URL = 'http://localhost:8000';

async function clearTransactions(request: APIRequestContext) {
  const response = await request.get(`${API_BASE_URL}/api/transactions`);
  expect(response.ok()).toBeTruthy();

  const transactions = (await response.json()) as Array<{ id: string }>;
  for (const transaction of transactions) {
    const deleteResponse = await request.delete(
      `${API_BASE_URL}/api/transactions/${transaction.id}`,
    );
    expect(deleteResponse.ok()).toBeTruthy();
  }
}


test.beforeEach(async ({ request }) => {
  await clearTransactions(request);
});

test.afterEach(async ({ request }) => {
  await clearTransactions(request);
});


test('critical transaction flow persists through the API and updates the dashboard', async ({ page }) => {
  const now = new Date();
  const transactionDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
  const merchant = 'Playwright Market';

  await page.goto('/transactions');
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add transaction' })).toBeEnabled();
  await expect(page.getByLabel('Category').first()).toHaveValue('Food');

  await page.getByLabel('Merchant').fill(merchant);
  await page.getByLabel('Amount').fill('42.50');
  await page.getByLabel('Description').fill('Critical E2E transaction');
  await page.getByLabel('Date').fill(transactionDate);
  await page.getByRole('button', { name: 'Add transaction' }).click();

  let row = page.getByRole('row').filter({ hasText: merchant });
  await expect(row).toContainText('€42.50');

  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByText(merchant)).toBeVisible();
  const expenseMetric = page.locator('article').filter({ hasText: 'Expenses this month' });
  await expect(expenseMetric).toContainText('€42.50');

  await page.getByRole('link', { name: 'Transactions' }).click();
  row = page.getByRole('row').filter({ hasText: merchant });
  await row.getByRole('button', { name: `Edit ${merchant}` }).click();
  await page.getByLabel('Amount').fill('150.25');
  await page.getByRole('button', { name: 'Save changes' }).click();

  row = page.getByRole('row').filter({ hasText: merchant });
  await expect(row).toContainText('€150.25');
  await expect(row).toContainText('Needs review');

  await row.getByRole('button', { name: `Delete ${merchant}` }).click();
  await expect(page.getByRole('row').filter({ hasText: merchant })).toHaveCount(0);
});
