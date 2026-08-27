import { expect, test } from '@playwright/test';


type SeedTransaction = {
  merchant: string;
  amount: string;
  date: string;
  category: string;
};


function dateInMonth(base: Date, monthOffset: number, day: number): string {
  const value = new Date(base.getFullYear(), base.getMonth() + monthOffset, day, 12, 0, 0, 0);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}


test('historical spending becomes a causal month-end forecast with comparable backtests', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-forecast-${unique}@example.com`;
  const password = 'playwright-secure-password';

  await page.goto('/register');
  await page.getByLabel('Display name').fill('Forecast User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const transactions: SeedTransaction[] = [];
  for (const offset of [-4, -3, -2, -1]) {
    const suffix = `${today.getFullYear()}-${today.getMonth() + 1}-${offset}-${unique}`;
    transactions.push(
      {
        merchant: `Variable early ${suffix}`,
        amount: '100.00',
        date: dateInMonth(today, offset, 10),
        category: 'Shopping',
      },
      {
        merchant: 'Forecast Cloud Plan',
        amount: '30.00',
        date: dateInMonth(today, offset, 20),
        category: 'Subscriptions',
      },
      {
        merchant: `Variable late ${suffix}`,
        amount: '100.00',
        date: dateInMonth(today, offset, 25),
        category: 'Shopping',
      },
    );
  }

  transactions.push({
    merchant: `Current variable ${unique}`,
    amount: '100.00',
    date: dateInMonth(today, 0, Math.max(1, Math.min(today.getDate(), 10))),
    category: 'Shopping',
  });

  await page.evaluate(async (rows) => {
    for (const row of rows) {
      const response = await fetch('/api/v2/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant: row.merchant,
          description: 'Forecast E2E fixture',
          category: row.category,
          amount: row.amount,
          date: row.date,
          type: 'expense',
          paymentMethod: 'card',
          isRecurring: false,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to seed forecast transaction: ${response.status}`);
      }
    }
  }, transactions);

  await page.getByRole('link', { name: 'Predictions' }).click();
  await expect(page.getByRole('heading', { name: 'Predictions' })).toBeVisible();

  const forecast = page.getByRole('region', { name: 'Month-end spending forecast' });
  await expect(forecast.getByText('spending-forecast-v1')).toBeVisible();
  await expect(forecast.getByRole('heading', { name: 'Estimated month-end spending' })).toBeVisible();
  await expect(forecast.getByRole('heading', { name: 'Previous 3 complete months' })).toBeVisible();
  await expect(forecast.getByRole('heading', { name: 'Current-month run rate' })).toBeVisible();
  await expect(forecast.getByRole('heading', { name: 'Recurrence-aware projection' })).toBeVisible();
  await expect(forecast.getByText(/day-15 chronological folds/)).toBeVisible();
  await expect(forecast.getByText('MAE', { exact: true })).toHaveCount(3);
  await expect(forecast.getByText('sMAPE', { exact: true })).toHaveCount(3);
  await expect(forecast.getByText('Bias', { exact: true })).toHaveCount(3);
});
