import { expect, test } from '@playwright/test';


test('password change keeps the current session active and rotates credentials', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-security-${unique}@example.com`;
  const oldPassword = 'playwright-security-old-password';
  const newPassword = 'playwright-security-new-password';

  await page.goto('/register');
  await page.getByLabel('Display name').fill('Playwright Security');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(oldPassword);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(oldPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Security' }).click();
  await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible();
  await page.getByLabel('Current password').fill(oldPassword);
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Update password' }).click();

  await expect(page.getByRole('status')).toContainText(
    'Password updated. Previously issued sessions have been revoked.',
  );
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(oldPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();
});
