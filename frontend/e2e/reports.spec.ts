import { expect, test } from '@playwright/test';


test('free account sees the real Premium reports entitlement boundary', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-reports-${unique}@example.com`;
  const password = 'playwright-secure-password';

  await page.goto('/register');
  await page.getByLabel('Display name').fill('Reports Playwright Owner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Premium report export' })).toBeVisible();
  await expect(page.getByText(/current account does not have this entitlement enabled/i)).toBeVisible();
  await expect(page.getByText(/billing checkout is not yet exposed/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download CSV' })).toHaveCount(0);
});
