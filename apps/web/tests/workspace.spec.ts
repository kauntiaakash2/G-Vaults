import { expect, test, type Page } from '@playwright/test';

const userPassword = process.env.E2E_USER_PASSWORD ?? 'ChangeMe123!';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(userPassword);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('mobile navigation keeps account controls accessible', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, process.env.E2E_EMAIL ?? 'admin@sih.local');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('link', { name: 'Cases', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cases', exact: true })).toBeVisible();
});

test('protected routes avoid page-level overflow at supported widths', async ({ page }) => {
  await signIn(page, process.env.E2E_EMAIL ?? 'admin@sih.local');
  for (const width of [360, 390, 430, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/dashboard', '/cases', '/search']) {
      await page.goto(route);
      await expect(page.locator('main#main-content')).toBeVisible();
      const dimensions = await page.evaluate(() => {
        window.scrollTo(1000, 0);
        return { viewport: window.innerWidth, body: document.body.scrollWidth, horizontalScroll: window.scrollX };
      });
      expect(dimensions.body <= dimensions.viewport && dimensions.horizontalScroll === 0, `${route} should not overflow at ${width}px: ${JSON.stringify(dimensions)}`).toBe(true);
    }
  }
});

test('investigator document journey preserves versions and enforces a revoked grant', async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = Date.now().toString();
  const title = `UI verification record ${suffix}`;
  const secret = `permission-scoped-content-${suffix}`;

  await signIn(page, 'investigator.a@sih.local');
  await page.getByRole('link', { name: 'Cases', exact: true }).first().click();
  await page.getByRole('link', { name: /Phishing campaign investigation CYB/ }).click();
  await page.getByRole('tab', { name: /Documents/ }).click();
  await page.getByRole('button', { name: 'Upload document' }).click();
  await page.getByLabel('Document title').fill(title);
  await page.getByLabel('Document type').fill('REPORT');
  await page.getByLabel('Source file').setInputFiles({ name: `record-${suffix}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Authorised test record\n${secret}`) });
  await page.getByRole('button', { name: 'Upload document' }).click();
  await page.locator('.primary-cell').filter({ hasText: title }).click();
  await expect(page).toHaveURL(/\/documents\//);
  const documentUrl = page.url();

  await page.getByRole('button', { name: 'Verify integrity' }).click();
  await expect(page.getByText('VERIFIED', { exact: true }).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Extracted text' }).click();
  await page.getByRole('button', { name: 'Extract or retry' }).click();
  await expect(page.locator('.extracted-text')).toContainText(secret);

  await page.getByRole('button', { name: 'New version' }).click();
  await page.getByLabel('Change description').fill('UI journey revision');
  await page.getByLabel('Replacement file').setInputFiles({ name: `record-${suffix}-v2.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Revised authorised test record\n${secret}`) });
  await page.getByRole('button', { name: 'Create version' }).click();
  await expect(page.getByText('v2 current', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: /Versions/ }).click();
  await expect(page.locator('.version-select').filter({ hasText: 'v1' })).toBeVisible();
  await expect(page.locator('.version-select').filter({ hasText: 'v2' })).toBeVisible();

  await page.getByRole('button', { name: 'Manage access' }).click();
  await page.locator('#grantDepartment').selectOption({ label: 'Financial Crime Unit (FIN)' });
  await page.getByRole('button', { name: 'Grant VIEW access' }).click();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'investigator.b@sih.local');
  await page.goto('/search');
  await page.getByLabel('Search documents').fill(title);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'investigator.a@sih.local');
  await page.goto(documentUrl);
  await page.getByRole('tab', { name: 'Access' }).click();
  const financialGrant = page.getByRole('row').filter({ hasText: 'Financial Crime Unit' }).filter({ hasText: 'ACTIVE' }).first();
  await financialGrant.getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('button', { name: 'Revoke access' }).click();
  await expect(financialGrant).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'investigator.b@sih.local');
  await page.goto(documentUrl);
  await expect(page.getByText('You do not have access to this document')).toBeVisible();
  await page.goto('/search');
  await page.getByLabel('Search documents').fill(title);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('No authorised documents matched')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'investigator.a@sih.local');
  await page.goto(documentUrl);
  await page.getByRole('tab', { name: /Audit/ }).click();
  await expect(page.getByRole('cell', { name: 'ACCESS REVOKED' }).first()).toBeVisible();
});
