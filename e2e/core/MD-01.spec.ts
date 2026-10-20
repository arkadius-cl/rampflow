import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { overrideEntitlement } from '../support/u4.ts';

test.describe('MD-01 Sites', () => {
  test('a tenant admin creates a site in its own time zone and sees the usage grow', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/sites`);
    await expect(page.getByRole('heading', { name: 'Sites and docks' })).toBeVisible();
    await expect(page.getByText('2 of 5')).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'New site' }).first().click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Name', { exact: true }).fill('Cluj Cross-Dock');
    await sheet.getByLabel('Street and number').fill('Strada Fabricii 12');
    await sheet.getByLabel('Postal code').fill('400632');
    await sheet.getByLabel('City').fill('Cluj-Napoca');
    await sheet.getByLabel('Country').fill('ro');
    await sheet.getByLabel('Region').fill('de-by');
    await sheet.getByLabel('Time zone').selectOption('Europe/Bucharest');
    await sheet.getByRole('button', { name: 'Create site' }).click();
    await expect(sheet.getByText('The region must belong to the country.')).toBeVisible();
    await sheet.getByLabel('Region').fill('RO-CJ');
    await sheet.getByRole('button', { name: 'Create site' }).click();

    await expect(page.getByRole('heading', { name: 'Cluj Cross-Dock' })).toBeVisible();
    await expect(
      page.getByText('Strada Fabricii 12, 400632 Cluj-Napoca · Europe/Bucharest'),
    ).toBeVisible();
    await expect(page.getByText('3 of 5')).toBeVisible();
    await page.goto(`/t/${w.A.tenantId}/sites`);
    await expect(
      page.getByRole('row', { name: /Cluj Cross-Dock.*Europe\/Bucharest/ }),
    ).toBeVisible();
  });

  test('the site beyond core.max_sites is refused and not created', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await overrideEntitlement(w, w.A.tenantId, 'core.max_sites', 2);
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/sites`);
    await expect(page.getByText('2 of 2')).toBeVisible();

    await page.getByRole('button', { name: 'New site' }).first().click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Name', { exact: true }).fill('One too many');
    await sheet.getByLabel('Street and number').fill('Am Kai 1');
    await sheet.getByLabel('Postal code').fill('20457');
    await sheet.getByLabel('City').fill('Hamburg');
    await sheet.getByRole('button', { name: 'Create site' }).click();
    await expect(page.getByText('Your package limit is reached.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: 'One too many' })).toHaveCount(0);
    await expect(page.getByText('2 of 2')).toBeVisible();
  });

  test('staff without core.manage_sites get no access', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/sites`);
    await expect(page.getByText('No access')).toBeVisible();
    await page.goto(`/t/${w.A.tenantId}/sites/${w.A.sites[0]?.id}`);
    await expect(page.getByText('No access')).toBeVisible();
  });

  test('each site tab has its own URL, back returns to the previous tab, a foreign site shows no access', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    const site = `/t/${w.A.tenantId}/sites/${w.A.sites[0]?.id}`;
    const tabs = page.getByRole('navigation', { name: 'Site sections' });

    await page.goto(`${site}/hours`);
    await expect(tabs.getByRole('link', { name: 'Hours and closures' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goto(site);
    await tabs.getByRole('link', { name: 'Load types' }).click();
    await expect(page).toHaveURL(new RegExp(`${site}/load-types$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${site}$`));
    await expect(tabs.getByRole('link', { name: 'Halls, docks and pools' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goto(`/t/${w.A.tenantId}/sites/${w.B.sites[0]?.id}`);
    await expect(page.getByText('No access')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Site sections' })).toHaveCount(0);
  });
});
