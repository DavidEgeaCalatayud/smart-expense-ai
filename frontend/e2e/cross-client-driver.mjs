import { chromium, expect } from '@playwright/test';

const [, , mode, email, password] = process.argv;
const baseURL = process.env.CROSS_CLIENT_BASE_URL ?? 'http://127.0.0.1:5173';

if (!['create-web', 'assert-native'].includes(mode) || !email || !password) {
  console.error('Usage: node e2e/cross-client-driver.mjs <create-web|assert-native> <email> <password>');
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ baseURL });

try {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('link', { name: 'Transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible({ timeout: 20_000 });

  if (mode === 'create-web') {
    const transactionDate = new Date().toISOString().slice(0, 10);
    await page.getByLabel('Merchant').fill('Web Bridge Coffee');
    await page.getByRole('spinbutton', { name: 'Amount' }).fill('23.45');
    await page.getByLabel('Description').fill('Cross-client browser to Android E2E');
    await page.getByLabel('Date').fill(transactionDate);
    await page.getByRole('button', { name: 'Add transaction' }).click();

    const row = page.getByRole('row').filter({ hasText: 'Web Bridge Coffee' });
    await expect(row).toContainText('€23.45', { timeout: 20_000 });
    await expect(page.getByRole('status')).toContainText('Transaction created successfully.');
    console.log('Cross-client browser created Web Bridge Coffee.');
  } else {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible({ timeout: 20_000 });
    const row = page.getByRole('row').filter({ hasText: 'Native Bridge Coffee' });
    await expect(row).toContainText('€34.56', { timeout: 30_000 });
    console.log('Cross-client browser observed Native Bridge Coffee.');
  }
} finally {
  await browser.close();
}
