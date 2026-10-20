import { expect, type Page, test } from '@playwright/test';
import { HttpMethod } from '../../packages/shared/src/values/http.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { setPassword } from '../support/db.ts';

test.describe('PL-02 Packages and overrides', () => {
  const group = (page: Page, name: string) =>
    page.getByRole('button', { name: new RegExp(`^${name} \\(\\d+\\)$`) });
  const savedPrefs = (page: Page) =>
    page.waitForResponse(
      (r) => r.url().endsWith('/api/me') && r.request().method() === HttpMethod.PATCH,
    );

  test('the platform admin sees the packages read-only, grouped by module', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.platformAdmin);

    await page.goto('/platform/packages');
    for (const name of ['Start', 'Pro', 'Enterprise']) {
      await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible();
    }
    // Collapsed at first: the header counts the features each package grants.
    await expect(page.getByRole('button', { name: 'Expand all' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Briefing quiz/ })).toHaveCount(0);
    await expect(page.getByTestId('module-group-safety').getByRole('cell')).toHaveText([
      'Safety (5)',
      /^2\/4/,
      /^4\/4/,
      /^4\/4/,
    ]);
    await expect(page.getByTestId('module-group-core').getByRole('cell')).toHaveText([
      'Core (3)',
      '',
      '',
      '',
    ]);
    for (const id of ['driver', 'i18n', 'privacy']) {
      await expect(page.getByTestId(`module-group-${id}`)).toHaveCount(0);
    }
    await expectAccessible(page);

    await group(page, 'Safety').click();
    await expect(group(page, 'Safety')).toHaveAttribute('aria-expanded', 'true');
    const quiz = page.getByRole('row', { name: /Briefing quiz/ });
    await expect(quiz.getByRole('cell')).toHaveText([/safety\.quiz/, 'Off', 'On', 'On']);
    await expect(page.getByTestId('module-group-safety').getByRole('cell').nth(1)).toHaveText('');
    await expect(page.getByRole('textbox')).toHaveCount(0);

    // By keyboard: the yard rows sit under their header.
    await group(page, 'Yard').focus();
    await page.keyboard.press('Enter');
    await expect(group(page, 'Yard')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-testid="module-group-yard"] + tr + tr + tr')).toHaveAttribute(
      'data-testid',
      'module-group-safety',
    );
    await expect(page.getByTestId('entitlement-yard.checkin_qr')).toBeVisible();

    await page.getByRole('button', { name: 'Expand all' }).click();
    await expect(page.getByRole('button', { name: 'Collapse all' })).toBeVisible();
    await expect(page.locator('table button[aria-expanded="false"]')).toHaveCount(0);
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expect(page.locator('table button[aria-expanded="true"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Expand all' })).toBeVisible();
  });

  test('the open groups follow the admin to another browser, per page', async ({
    page,
    context,
    request,
    browser,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.platformAdmin);
    await page.goto('/platform/packages');
    const saved = savedPrefs(page);
    await group(page, 'Yard').click();
    await saved;

    const other = await browser.newContext();
    await signInAs(other, w.platformAdmin);
    const second = await other.newPage();
    await second.goto('/platform/packages');
    await expect(group(second, 'Yard')).toHaveAttribute('aria-expanded', 'true');
    await expect(second.locator('table button[aria-expanded="true"]')).toHaveCount(1);

    await second.goto(`/platform/tenants/${w.A.tenantId}`);
    await expect(group(second, 'Yard')).toHaveAttribute('aria-expanded', 'false');
    await expect(second.locator('table button[aria-expanded="true"]')).toHaveCount(0);
    await other.close();
  });

  test('an override turning off the logo hides the tenant admin’s nav item until removed', async ({
    page,
    context,
    request,
    browser,
  }) => {
    // Two browsers, five round trips to the platform and a reload of the tenant shell.
    test.slow();
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
    await expect(page.locator('table button[aria-expanded="true"]')).toHaveCount(0);
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
    // Collapsed, the value column counts the override, the package column what the package grants.
    await expect(page.getByTestId('module-group-brand').getByRole('cell')).toHaveText([
      'Branding (1)',
      /^0\/1/,
      /^1\/1/,
      '',
    ]);
    await group(page, 'Branding').click();
    await expect(page.getByTestId('entitlement-brand.logo')).toContainText('Override');
    await expectAccessible(page);

    await page.getByLabel('Entitlement').selectOption('core.max_sites');
    await page.getByLabel('Value', { exact: true }).fill('9');
    await page.getByRole('button', { name: 'Add override' }).click();
    await expect(page.getByTestId('override-core.max_sites')).toContainText('higher');
    await group(page, 'Core').click();
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

  test('a tenant view link opened signed out leads back to the same tenant after sign-in', async ({
    page,
    request,
  }) => {
    const w = await seedWorld(request);
    await setPassword(w.platformAdmin.id, 'platform password 1');
    const view = `/platform/tenants/${w.A.tenantId}`;

    await page.goto(view);
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel('Email').fill(w.platformAdmin.email);
    await page.getByLabel('Password', { exact: true }).fill('platform password 1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${view}$`));
    await expect(page.getByRole('heading', { name: /Tenant A/ })).toBeVisible();
  });
});
