import { expect, test } from '@playwright/test';
import { HttpMethod } from '../../packages/shared/src/values/http.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import {
  apiCall,
  newSiteBody,
  nextMonday,
  overrideEntitlement,
  poolWorldDocks,
  siteOf,
} from '../support/u4.ts';

interface LoadTypes {
  items: { id: string; name: { en: string } }[];
}

/** The English name of the seeded load type the story edits. */
const PALLETISED = 'Palletised';

test.describe('MD-05 Load types', () => {
  test('a new site lists the three seeded load types; 20 pallets take 60 minutes, 40 take 90', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await poolWorldDocks(context, w);
    const site = await apiCall<{ id: string }>(
      context,
      HttpMethod.POST,
      `/t/${w.A.tenantId}/sites`,
      newSiteBody('Garching'),
    );
    await page.goto(`/t/${w.A.tenantId}/sites/${site.id}/load-types`);
    await expect(page.getByRole('row', { name: /Parcel \/ van.*15 min/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Floor-loaded \/ loose.*90 min/ })).toBeVisible();
    const palletised = page.getByRole('row', { name: /Palletised/ });
    await expect(palletised).toContainText('up to 16: 30 min');
    await expect(palletised).toContainText('up to 33: 60 min');
    await expect(palletised).toContainText('more: 90 min');
    await expectAccessible(page);

    const { items } = await apiCall<LoadTypes>(
      context,
      HttpMethod.GET,
      `/t/${w.A.tenantId}/capacity/load-types?siteId=${site.id}`,
    );
    const id = items.find((lt) => lt.name.en === PALLETISED)?.id;
    const minutes = async (units: number) =>
      (
        await apiCall<{ durationMinutes: number }>(
          context,
          HttpMethod.GET,
          `/t/${w.A.tenantId}/capacity/availability?siteId=${site.id}&date=${nextMonday()}&loadTypeId=${id}&loadUnits=${units}`,
        )
      ).durationMinutes;
    expect(await minutes(20)).toBe(60);
    expect(await minutes(40)).toBe(90);
  });

  test('a tenant admin creates a tiered load type bookable on the pool for staff only', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const s = siteOf(w.A);
    await signInAs(context, w.A.users.tenant_admin);
    await poolWorldDocks(context, w);
    await page.goto(`/t/${w.A.tenantId}/sites/${s.id}/load-types`);
    await page.getByRole('button', { name: 'New load type' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Name (German)').fill('Kühlware');
    await sheet.getByLabel('Name (English)').fill('Chilled goods');
    await sheet.getByRole('button', { name: 'By load units' }).click();
    await sheet.getByLabel('Tier 1, up to units').fill('10');
    await sheet.getByLabel('Tier 1, minutes').fill('45');
    await sheet.getByLabel('Tier 2, minutes').fill('62');
    await sheet.getByLabel('Buffer after each booking').fill('15');
    await sheet.getByRole('checkbox', { name: 'Ramp pool' }).check();
    await sheet.getByRole('switch', { name: 'Carriers can book it' }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet.getByText('Use steps of 5 minutes.')).toBeVisible();
    await sheet.getByLabel('Tier 2, minutes').fill('60');
    await sheet.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Load type saved')).toBeVisible();
    const row = page.getByRole('row', { name: /Chilled goods/ });
    await expect(row).toContainText('up to 10: 45 min');
    await expect(row).toContainText('more: 60 min');
    await expect(row).toContainText('15 min');
    await expect(row).toContainText('Ramp pool');
    await expect(row).toContainText('Staff only');
  });

  test('without booking.duration_rules only fixed durations can be chosen', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await overrideEntitlement(w, w.A.tenantId, 'booking.duration_rules', false);
    await signInAs(context, w.A.users.tenant_admin);
    await poolWorldDocks(context, w);
    await page.goto(`/t/${w.A.tenantId}/sites/${siteOf(w.A).id}/load-types`);
    await page.getByRole('button', { name: 'New load type' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('button', { name: 'By load units' })).toBeDisabled();
    await expect(sheet.getByText('Your package does not include duration rules.')).toBeVisible();
  });
});
