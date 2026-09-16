import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('email link resets password once and revokes an existing browser session', async ({ page, browser }) => {
  const email = `recovery-e2e-${Date.now()}@example.com`;
  const oldPassword = 'old-password-recovery-123';
  const newPassword = 'new-password-recovery-456';
  const other = await browser.newContext();
  const registration = await other.request.post('http://localhost:8000/api/v1/auth/register', { data: { email, password: oldPassword, displayName: 'Recovery E2E' } });
  expect(registration.status()).toBe(201);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send recovery email' }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists');
  const outbox = `/tmp/smart-expense-recovery-outbox/${createHash('sha256').update(email).digest('hex')}.json`;
  let resetUrl = '';
  await expect.poll(async () => {
    try { resetUrl = JSON.parse(await readFile(outbox, 'utf8')).resetUrl; return Boolean(resetUrl); }
    catch { return false; }
  }).toBe(true);
  await page.goto(resetUrl);
  await expect(page).toHaveURL(/\/reset-password$/);
  // Opening the email is safe even for link scanners: no confirmation until submit.
  expect((await other.request.get('http://localhost:8000/api/v1/auth/me')).status()).toBe(200);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('status')).toContainText('signed out on all devices');
  expect((await other.request.get('http://localhost:8000/api/v1/auth/me')).status()).toBe(401);
  await page.goto(resetUrl);
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('This reset link is invalid or expired. Request a new one.')).toBeVisible();
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await other.close();
});
