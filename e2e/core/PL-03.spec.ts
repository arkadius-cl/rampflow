import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { resetPlatformSetting } from '../support/u3.ts';

// The platform level is shared by every tenant of the database, so this spec owns one key that
// no other spec reads, and puts it back afterwards.
const KEY = 'yard.standgeld_flag_minutes';
const COUNTRIES = 'core.site_countries';

test.describe('PL-03 Platform defaults', () => {
  test('the platform admin edits a default; a tenant override keeps winning', async ({
    page,
    context,
    request,
    browser,
  }) => {
    // Two browsers editing one setting at two levels.
    test.slow();
    const w = await seedWorld(request);
    await resetPlatformSetting(request, w, KEY);
    const admin = await browser.newContext();
    await signInAs(admin, w.A.users.tenant_admin);
    const tenantPage = await admin.newPage();
    await tenantPage.goto(`/t/${w.A.tenantId}/settings`);
    const tenantField = tenantPage.getByTestId(`setting-${KEY}`);
    await tenantField.getByRole('spinbutton').fill('90');
    await tenantField.getByRole('button', { name: 'Save' }).click();
    await expect(tenantField).toContainText('Set here (Tenant)');

    try {
      await signInAs(context, w.platformAdmin);
      await page.goto('/platform/settings');
      await expect(page.getByRole('heading', { name: 'Platform defaults' })).toBeVisible();
      await expectAccessible(page);
      const field = page.getByTestId(`setting-${KEY}`);
      await expect(field).toContainText('Inherited from Default');

      await field.getByRole('spinbutton').fill('5');
      await field.getByRole('button', { name: 'Save' }).click();
      await expect(field.getByRole('alert')).toHaveText('Enter a whole number from 30 to 1,440.');

      await field.getByRole('spinbutton').fill('180');
      await field.getByRole('button', { name: 'Save' }).click();
      await expect(field).toContainText('Set here (Platform)');
      await expect(field.getByRole('button', { name: 'Reset to inherited (120)' })).toBeVisible();

      await tenantPage.reload();
      await expect(tenantField).toContainText('Set here (Tenant)');
      await expect(tenantField.getByRole('spinbutton')).toHaveValue('90');
      await expect(
        tenantField.getByRole('button', { name: 'Reset to inherited (180)' }),
      ).toBeVisible();

      await field.getByRole('button', { name: 'Reset to inherited (120)' }).click();
      await expect(field).toContainText('Inherited from Default');
      await expect(field.getByRole('spinbutton')).toHaveValue('120');
    } finally {
      await resetPlatformSetting(request, w, KEY);
      await admin.close();
    }
  });

  test('the platform admin admits a country found by name, and tenants can place sites there', async ({
    page,
    context,
    request,
    browser,
  }) => {
    test.slow();
    const w = await seedWorld(request);
    // Only adds a country outside the EU default, so specs creating EU sites meanwhile still pass.
    await resetPlatformSetting(request, w, COUNTRIES);
    try {
      await signInAs(context, w.platformAdmin);
      await page.goto('/platform/settings');
      const field = page.getByTestId(`setting-${COUNTRIES}`);
      await expect(field.getByRole('list', { name: 'Admitted countries' })).toContainText(
        'Germany',
      );

      await field.getByRole('searchbox').fill('norw');
      await field.getByRole('button', { name: 'Add Norway' }).click();
      await expect(field.getByRole('searchbox')).toHaveValue('');
      await expect(field.getByRole('searchbox')).toBeFocused();
      await expect(field.getByRole('button', { name: 'Remove Norway' })).toBeVisible();
      await field.getByRole('button', { name: 'Save' }).click();
      await expect(field).toContainText('Set here (Platform)');
      await expectAccessible(page);

      const admin = await browser.newContext();
      await signInAs(admin, w.A.users.tenant_admin);
      const tenantPage = await admin.newPage();
      await tenantPage.goto(`/t/${w.A.tenantId}/sites`);
      await tenantPage.getByRole('button', { name: 'New site' }).first().click();
      const sheet = tenantPage.getByRole('dialog');
      await sheet.getByLabel('Country').selectOption({ label: 'Norway' });
      await expect(sheet.getByLabel('Country')).toHaveValue('NO');
      await sheet.getByLabel('Name', { exact: true }).fill('Oslo Terminal');
      await sheet.getByLabel('Street and number').fill('Havnegata 1');
      await sheet.getByLabel('Postal code').fill('0150');
      await sheet.getByLabel('City').fill('Oslo');
      await sheet.getByLabel('Time zone').selectOption('Europe/Oslo');
      await sheet.getByRole('button', { name: 'Create site' }).click();
      await expect(tenantPage.getByRole('heading', { name: 'Oslo Terminal' })).toBeVisible();
      await admin.close();
    } finally {
      await resetPlatformSetting(request, w, COUNTRIES);
    }
  });
});
