import { expect, type Page, type Request, test } from '@playwright/test';
import { Setting } from '../../packages/shared/src/values/keys.ts';
import { StaffLocale } from '../../packages/shared/src/values/locales.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { resetPlatformSetting, settingField } from '../support/u3.ts';
import { setLocale } from '../support/u11.ts';

// The platform level is shared by every tenant of the database, so each test that writes owns
// keys no other spec reads, and puts them back afterwards.

/** The platform settings PATCHes the page sends from now on. */
function patches(page: Page): Request[] {
  const route = '/api/platform/settings';
  const sent: Request[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && new URL(r.url()).pathname === route) {
      sent.push(r);
    }
  });
  return sent;
}

const topics = (page: Page) => page.getByRole('navigation', { name: 'Settings topics' });

test.describe('PL-03 Platform defaults', () => {
  test('the settings root opens the first topic, and the topic nav moves between topics', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.platformAdmin);

    await page.goto('/platform/settings');
    await expect(page).toHaveURL(/\/platform\/settings\/general$/);
    await expect(page.getByRole('heading', { level: 1, name: 'General' })).toBeVisible();
    await expect(topics(page).getByRole('link', { name: 'General' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectAccessible(page);

    await topics(page).getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/platform\/settings\/privacy$/);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Privacy notice',
      'Retention',
      'Driver access',
    ]);
    await page.goBack();
    await expect(page).toHaveURL(/\/platform\/settings\/general$/);
  });

  test('a deep link focuses its field, so Tab reaches the input', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.platformAdmin);
    const key = Setting.privacy.retention.visit_days;

    await page.goto(`/platform/settings/privacy#${key}`);
    const field = settingField(page, key);
    await expect(field.getByRole('heading', { name: 'Keep visits' })).toBeFocused();
    await expect(field).toHaveAttribute('data-highlighted');
    await expect(field.getByRole('heading', { name: 'Keep visits' })).toBeInViewport();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('spinbutton', { name: 'Keep visits' })).toBeFocused();
  });

  test('the search finds the driver link setting by a German word', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await setLocale(w.platformAdmin.id, StaffLocale.de);
    await signInAs(context, w.platformAdmin);

    await page.goto('/platform/settings/general');
    await expect(page.getByRole('link', { name: 'Einstellungen', exact: true })).toHaveAttribute(
      'href',
      '/platform/settings',
    );
    await page.getByRole('button', { name: 'Einstellungen durchsuchen' }).click();
    await page.getByRole('combobox').fill('Fahrerlink');
    const result = page.getByRole('option', { name: /Fahrerlinks/ });
    await expect(result).toHaveCount(1);
    await expect(result).toContainText('Datenschutz › Fahrerzugang');
    await result.click();
    await expect(page).toHaveURL(
      new RegExp(`/platform/settings/privacy#${Setting.privacy.retention.driver_link_hours}$`),
    );
    await expect(
      settingField(page, Setting.privacy.retention.driver_link_hours).getByRole('heading'),
    ).toBeFocused();
  });

  test('the admin un-admits Malta from the grouped country list', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await resetPlatformSetting(request, w, Setting.core.site_countries);
    try {
      await signInAs(context, w.platformAdmin);
      await page.goto('/platform/settings/general');
      const field = settingField(page, Setting.core.site_countries);
      await expect(field).toContainText('27 of 57 selected');
      await expect(field.getByRole('checkbox', { name: 'EU member states' })).toBeChecked();

      await field.getByRole('checkbox', { name: 'Malta' }).click();
      await expect(field).toContainText('26 of 57 selected');
      await expect(field.getByRole('checkbox', { name: 'EU member states' })).toHaveAttribute(
        'aria-checked',
        'mixed',
      );
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(field).toContainText('Set for the platform');

      await page.reload();
      await expect(field).toContainText('26 of 57 selected');
      await expect(field.getByRole('checkbox', { name: 'Malta' })).not.toBeChecked();
    } finally {
      await resetPlatformSetting(request, w, Setting.core.site_countries);
    }
  });

  test('lowering a retention period asks first and saves only on confirm', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const key = Setting.privacy.retention.audit_log_days;
    await resetPlatformSetting(request, w, key);
    try {
      await signInAs(context, w.platformAdmin);
      const sent = patches(page);
      await page.goto('/platform/settings/privacy');
      const field = settingField(page, key);
      const input = page.getByRole('spinbutton', { name: 'Keep the audit log' });
      await expect(input).toHaveValue('365');
      await expect(field).toContainText('Product default');

      await input.fill('360');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toContainText('Keep the audit log: 365 → 360 days');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(input).toHaveValue('360');
      await expect(page.getByText('Unsaved changes: 1')).toBeVisible();
      expect(sent).toHaveLength(0);

      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await dialog.getByRole('button', { name: 'Shorten and save' }).click();
      await expect(field).toContainText('Set for the platform');
      expect(sent).toHaveLength(1);
      await page.reload();
      await expect(input).toHaveValue('360');
    } finally {
      await resetPlatformSetting(request, w, key);
    }
  });
});
