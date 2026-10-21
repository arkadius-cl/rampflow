import { expect, type Page, type Request, test } from '@playwright/test';
import { Feature, Setting } from '../../packages/shared/src/values/keys.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { putOverride, settingField } from '../support/u3.ts';

const horizon = Setting.booking.horizon_days;
const lead = Setting.booking.min_lead_minutes;

/** The settings PATCHes the page sends from now on. */
function patches(page: Page, orgId: string): Request[] {
  const sent: Request[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && new URL(r.url()).pathname === `/api/t/${orgId}/settings`) {
      sent.push(r);
    }
  });
  return sent;
}

const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });

test.describe('TN-02 Settings', () => {
  test('a topic saves its edits in one request, discards them, and asks before leaving', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    const sent = patches(page, w.A.tenantId);

    await page.goto(`/t/${w.A.tenantId}/settings/booking`);
    const horizonInput = page.getByRole('spinbutton', { name: 'Booking horizon' });
    const leadInput = page.getByRole('spinbutton', { name: 'Minimum lead time' });
    await expect(settingField(page, horizon)).toContainText('Product default');
    await expect(horizonInput).toHaveValue('30');
    await expect(page.getByText('No unsaved changes')).toBeVisible();
    await expectAccessible(page);

    await horizonInput.fill('45');
    await leadInput.fill('60');
    await expect(page.getByText('Unsaved changes: 2')).toBeVisible();
    await saveButton(page).click();
    await expect(settingField(page, horizon)).toContainText('Set for this tenant');
    await expect(settingField(page, lead)).toContainText('Set for this tenant');
    await expect(settingField(page, horizon)).toContainText('Inherited: 30 (Product default)');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.postDataJSON()).toEqual({
      siteId: null,
      set: { [horizon]: 45, [lead]: 60 },
      reset: [],
    });

    await horizonInput.fill('50');
    await leadInput.fill('90');
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(horizonInput).toHaveValue('45');
    await expect(leadInput).toHaveValue('60');
    await expect(page.getByText('No unsaved changes')).toBeVisible();

    await horizonInput.fill('50');
    const topics = page.getByRole('navigation', { name: 'Settings topics' });
    await topics.getByRole('link', { name: 'Yard' }).click();
    const leave = page.getByRole('alertdialog', { name: 'Leave without saving?' });
    await leave.getByRole('button', { name: 'Stay' }).click();
    await expect(page).toHaveURL(/\/settings\/booking$/);
    await expect(horizonInput).toHaveValue('50');
    await topics.getByRole('link', { name: 'Yard' }).click();
    await leave.getByRole('button', { name: 'Leave' }).click();
    await expect(page).toHaveURL(/\/settings\/yard$/);
    expect(sent).toHaveLength(1);
  });

  test('a site inherits the tenant value, overrides it, and goes back to it', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    const site = w.A.sites[0]?.id as string;
    const sent = patches(page, w.A.tenantId);

    await page.goto(`/t/${w.A.tenantId}/settings/booking`);
    await page.getByRole('spinbutton', { name: 'Booking horizon' }).fill('45');
    await saveButton(page).click();
    await expect(settingField(page, horizon)).toContainText('Set for this tenant');

    await page.goto(`/t/${w.A.tenantId}/sites/${site}/settings/booking`);
    const field = settingField(page, horizon);
    const input = page.getByRole('spinbutton', { name: 'Booking horizon' });
    await expect(input).toHaveValue('45');
    await expect(field.getByRole('link', { name: 'From tenant' })).toHaveAttribute(
      'href',
      `/t/${w.A.tenantId}/settings/booking#${horizon}`,
    );
    await expectAccessible(page);

    await input.fill('60');
    await saveButton(page).click();
    await expect(field).toContainText('Set for this site');
    await expect(field).toContainText('Inherited: 45 (From tenant)');

    await field.getByRole('button', { name: 'Use inherited value (45)' }).click();
    await expect(input).toHaveValue('45');
    await expect(field).toContainText('Uses the inherited value after saving');
    await saveButton(page).click();
    await expect(field.getByRole('link', { name: 'From tenant' })).toBeVisible();
    await expect(input).toHaveValue('45');
    expect(sent.at(-1)?.postDataJSON()).toEqual({ siteId: site, set: {}, reset: [horizon] });
  });

  test('?site= opens the site Settings tab; a foreign site shows no access', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    const site = w.A.sites[0]?.id as string;

    await page.goto(`/t/${w.A.tenantId}/settings?site=${site}`);
    await expect(page).toHaveURL(new RegExp(`/t/${w.A.tenantId}/sites/${site}/settings/booking$`));

    await page.goto(`/t/${w.A.tenantId}/settings?site=${w.B.sites[0]?.id}`);
    await expect(page.getByText('No access')).toBeVisible();
    await expect(page.locator('[data-setting]')).toHaveCount(0);
  });

  test('with reminders off, neither the booking topic nor the search shows them', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    const reminder = page.getByRole('option', { name: /Reminder before the slot/ });

    await page.goto(`/t/${w.A.tenantId}/settings/booking`);
    await expect(page.getByRole('heading', { level: 2, name: 'Reminders' })).toBeVisible();
    await page.getByRole('button', { name: 'Search settings' }).click();
    await page.getByRole('combobox').fill('reminder');
    await expect(reminder).toBeVisible();

    await putOverride(request, w, w.A.tenantId, Feature.notify.reminders, false);
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'Booking rules' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Reminders' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Search settings' }).click();
    await page.getByRole('combobox').fill('reminder');
    await expect(page.getByText('No setting found.')).toBeVisible();
    await expect(reminder).toHaveCount(0);
  });
});
