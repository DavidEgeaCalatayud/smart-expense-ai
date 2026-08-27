import { expect, test } from '@playwright/test';


test('Financial Assistant renders only backend-grounded evidence for a stateless question', async ({ page }) => {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `playwright-assistant-${unique}@example.com`;
  const password = 'playwright-secure-password';

  await page.goto('/register');
  await page.getByLabel('Display name').fill('Assistant User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your financial overview' })).toBeVisible();

  let postedBody: unknown = null;
  await page.route('**/api/v2/assistant/query', async (route) => {
    postedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: 'You spent €273.35 more than last month, concentrated in Restaurants and Transport.',
        evidence: [
          {
            source: 'period_comparison',
            reference: '2026-07_vs_2026-08',
            label: '2026-07 vs 2026-08 expense comparison',
          },
        ],
        limitations: [],
        requestId: 'e2e-assistant-request',
      }),
    });
  });

  await page.getByRole('link', { name: 'Assistant' }).click();
  await expect(page.getByRole('heading', { name: 'Ask your financial data, not a black box' })).toBeVisible();
  await page.getByLabel('Ask about your finances').fill('Why did I spend more this month?');
  await page.getByRole('button', { name: 'Ask Financial Assistant' }).click();

  const answer = page.getByRole('region', { name: 'Financial Assistant answer' });
  await expect(answer.getByText(/€273.35 more/)).toBeVisible();
  await expect(answer.getByText('Period comparison')).toBeVisible();
  await expect(answer.getByText('2026-07 vs 2026-08 expense comparison')).toBeVisible();
  expect(postedBody).toEqual({ question: 'Why did I spend more this month?' });
});
