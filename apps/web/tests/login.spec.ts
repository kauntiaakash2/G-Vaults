import { expect, test } from '@playwright/test';

test('admin can log in and reach the dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'admin@sih.local');
  await page.getByLabel('Password').fill(process.env.E2E_PASSWORD ?? 'ChangeMe123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Operational overview' })).toBeVisible();
  await expect(page.locator('.utility-user strong')).toHaveText('Admin');
});
