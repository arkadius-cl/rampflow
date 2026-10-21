import { expect, test } from '@playwright/test';
import { expectAccessible, signInByApi } from '../support/auth.ts';
import { createOnboardingTenant } from '../support/db.ts';

test.describe('ON-01 Onboarding checklist', () => {
  test('the admin of a new tenant is led from the tenant home through site, hall and dock', async ({
    page,
    context,
  }) => {
    const t = await createOnboardingTenant();
    await signInByApi(context.request, t.users.tenant_admin);
    await page.goto(`/t/${t.tenantId}`);
    await expect(page).toHaveURL(new RegExp(`/t/${t.tenantId}/onboarding$`));
    await expect(page.getByRole('heading', { name: 'Set up your company' })).toBeVisible();
    await expect(page.getByText('0 of 3 steps done')).toBeVisible();
    await expectAccessible(page);

    const step = (title: string) =>
      page.locator('[data-slot="item"]', { has: page.getByText(title, { exact: true }) });
    await expect(step('Create a site')).toContainText('Open');
    await expect(step('Add a hall')).toContainText('Create a site first.');
    await expect(step('Create a site')).toHaveAttribute('href', `/t/${t.tenantId}/sites?new=1`);

    await step('Create a site').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'New site' })).toBeVisible();
    await sheet.getByLabel('Name', { exact: true }).fill('Bremerhaven');
    await sheet.getByLabel('Street and number').fill('Am Lunedeich 1');
    await sheet.getByLabel('Postal code').fill('27572');
    await sheet.getByLabel('City').fill('Bremerhaven');
    await sheet.getByRole('button', { name: 'Create site' }).click();
    await expect(page.getByRole('heading', { name: 'Bremerhaven' })).toBeVisible();
    const siteUrl = new URL(page.url()).pathname;

    await page.goto(`/t/${t.tenantId}/onboarding`);
    await expect(page.getByText('1 of 3 steps done')).toBeVisible();
    await expect(step('Create a site')).toContainText('Done');
    const hours = page.getByRole('definition');
    await expect(hours.first()).toHaveText('06:00–14:00');
    await expect(hours.last()).toHaveText('Closed');
    await expect(page.getByRole('link', { name: 'Edit opening hours' })).toHaveAttribute(
      'href',
      `${siteUrl}/hours`,
    );
    await expect(step('Add a hall')).toHaveAttribute('href', siteUrl);

    await step('Add a hall').click();
    await page.getByRole('button', { name: 'New hall' }).first().click();
    await page.getByRole('dialog').getByLabel('Hall name').fill('Halle 1');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('No docks in this hall yet.')).toBeVisible();

    await page.goto(`/t/${t.tenantId}/onboarding`);
    await expect(page.getByText('2 of 3 steps done')).toBeVisible();
    await expect(step('Add a hall')).toContainText('Done');
    await expect(step('Add a dock')).toContainText('Open');
    await expect(step('Add a dock')).toHaveAttribute('href', siteUrl);

    await step('Add a dock').click();
    await page.getByRole('button', { name: 'Dock', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Code').fill('T01');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row', { name: /T01/ })).toBeVisible();

    await page.goto(`/t/${t.tenantId}/onboarding`);
    await expect(page.getByRole('heading', { name: 'Your company is set up' })).toBeVisible();
    for (const title of ['Create a site', 'Add a hall', 'Add a dock']) {
      await expect(step(title)).toContainText('Done');
    }
    await expect(page.getByText(/^Active since \w+ \d{1,2}, \d{4},/)).toBeVisible();
    const next = page.getByRole('navigation', { name: 'Next steps' });
    await expect(next.getByRole('link', { name: 'Invite carriers' })).toHaveAttribute(
      'href',
      `/t/${t.tenantId}/carriers`,
    );
    await expect(next.getByRole('link', { name: 'Create a public booking link' })).toHaveAttribute(
      'href',
      `/t/${t.tenantId}/carriers?tab=links`,
    );
    await expect(next.getByRole('link', { name: 'Invite staff' })).toHaveAttribute(
      'href',
      `/t/${t.tenantId}/staff`,
    );

    // An active tenant's home opens the first screen of the navigation again.
    await page.goto(`/t/${t.tenantId}`);
    await expect(page).not.toHaveURL(/\/onboarding$/);
  });

  test('a dispatcher of a tenant in onboarding gets the tenant home and no checklist', async ({
    page,
    context,
  }) => {
    const t = await createOnboardingTenant();
    await signInByApi(context.request, t.users.dispatcher);
    await page.goto(`/t/${t.tenantId}`);
    await expect(
      page.getByText('Your company is still being set up.', { exact: false }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('link', { name: 'Open the setup checklist' })).toHaveCount(0);
    await page.goto(`/t/${t.tenantId}/onboarding`);
    await expect(page.getByText('No access')).toBeVisible();
  });
});
