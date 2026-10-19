import { expect, test } from '@playwright/test';

test('home page shows API and database health', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('rampflow', { exact: true })).toBeVisible();
  await expect(page.getByTestId('api-status')).toHaveText('ok');
  await expect(page.getByTestId('db-status')).toHaveText('ok');
});
