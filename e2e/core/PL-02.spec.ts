import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';

test.describe('PL-02 Packages and overrides', () => {
  test('the platform admin sees the packages read-only', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.platformAdmin);

    await page.goto('/platform/packages');
    for (const name of ['Start', 'Pro', 'Enterprise']) {
      await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
    }
    const quiz = page.getByRole('row', { name: /Briefing quiz/ });
    await expect(quiz.getByRole('cell')).toHaveText([/safety\.quiz/, 'Off', 'On', 'On']);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expectAccessible(page);
  });

  test('an override turning off the logo hides the tenant admin’s nav item until removed', async ({
    page,
    context,
    request,
    browser,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.platformAdmin);
    const admin = await browser.newContext();
    await signInAs(admin, w.A.users.tenant_admin);
    const tenantPage = await admin.newPage();
    await tenantPage.goto(`/t/${w.A.tenantId}/staff`);
    await expect(
      tenantPage.locator('[data-slot="sidebar-content"]').getByRole('link', { name: 'Logo' }),
    ).toBeVisible();

    await page.goto(`/platform/tenants/${w.A.tenantId}`);
    await expect(page.getByText('No overrides. The package applies as it is.')).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel('Entitlement').selectOption('brand.logo');
    await page.getByLabel('Value').selectOption('false');
    await page.getByLabel('Expires at (your time)').fill('2030-01-31T18:00');
    await page.getByLabel('Note').fill('Logo paused');
    await page.getByRole('button', { name: 'Add override' }).click();

    const override = page.getByTestId('override-brand.logo');
    await expect(override).toContainText('Off');
    await expect(override).toContainText('lower');
    await expect(override).toContainText('2030');
    await expect(page.getByTestId('entitlement-brand.logo')).toContainText('Override');

    await page.getByLabel('Entitlement').selectOption('core.max_sites');
    await page.getByLabel('Value', { exact: true }).fill('9');
    await page.getByRole('button', { name: 'Add override' }).click();
    await expect(page.getByTestId('override-core.max_sites')).toContainText('higher');
    await expect(page.getByTestId('entitlement-core.max_sites')).toContainText('9');

    await tenantPage.reload();
    await expect(
      tenantPage.locator('[data-slot="sidebar-content"]').getByRole('link', { name: 'Staff' }),
    ).toBeVisible();
    await expect(
      tenantPage.locator('[data-slot="sidebar-content"]').getByRole('link', { name: 'Logo' }),
    ).toHaveCount(0);
    await tenantPage.goto(`/t/${w.A.tenantId}/brand`);
    await expect(tenantPage.getByText('No access')).toBeVisible();

    await page.getByRole('button', { name: 'Remove the override of brand.logo' }).click();
    await expect(page.getByTestId('override-brand.logo')).toHaveCount(0);
    await tenantPage.goto(`/t/${w.A.tenantId}/staff`);
    await expect(
      tenantPage.locator('[data-slot="sidebar-content"]').getByRole('link', { name: 'Logo' }),
    ).toBeVisible();
    await admin.close();
  });
});
