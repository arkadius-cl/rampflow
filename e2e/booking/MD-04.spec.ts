import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { apiCall, newSiteBody, nextMonday, poolWorldDocks, siteOf } from '../support/u4.ts';

interface Offers {
  starts: { wallTime: string }[];
}

test.describe('MD-04 Hours and closures', () => {
  test('no start time is offered outside the hours or inside a closure set on screen', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const s = siteOf(w.A);
    await signInAs(context, w.A.users.tenant_admin);
    await poolWorldDocks(context, w);
    await apiCall(
      context,
      'PUT',
      `/t/${w.A.tenantId}/capacity/load-types/${s.loadTypeId}/resources`,
      {
        resourceIds: [s.resourceId],
      },
    );
    const monday = nextMonday();
    const offered = async () =>
      (
        await apiCall<Offers>(
          context,
          'GET',
          `/t/${w.A.tenantId}/capacity/availability?siteId=${s.id}&date=${monday}&loadTypeId=${s.loadTypeId}`,
        )
      ).starts.map((x) => x.wallTime);

    await page.goto(`/t/${w.A.tenantId}/sites/${s.id}/hours`);
    await expect(page.getByText('Wall-clock times in Europe/Berlin (CET/CEST).')).toBeVisible();
    await page.getByRole('button', { name: 'Add a window on Monday' }).click();
    await page.getByLabel('Monday opens').fill('08:00');
    await page.getByLabel('Monday closes').fill('12:00');
    await page.getByRole('button', { name: 'Add a window on Monday' }).click();
    await page.getByLabel('Monday opens').nth(1).fill('11:00');
    await page.getByLabel('Monday closes').nth(1).fill('14:00');
    await page.getByRole('button', { name: 'Save hours' }).click();
    await expect(page.getByText('Overlaps another window of the day.')).toBeVisible();
    await page.getByLabel('Monday opens').nth(1).fill('12:00');
    await page.getByRole('button', { name: 'Save hours' }).click();
    await expect(page.getByText('Hours saved')).toBeVisible();
    await expectAccessible(page);

    const all = await offered();
    expect(all[0]).toBe('08:00');
    expect(all.at(-1)).toBe('13:30');

    await page.getByRole('button', { name: 'Add closure' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Applies to').selectOption({ label: 'Ramp pool' });
    await dialog.getByLabel('Kind').selectOption({ label: 'Blocked' });
    await dialog.getByLabel('Starts').fill(`${monday}T10:00`);
    await dialog.getByLabel('Ends').fill(`${monday}T11:00`);
    await dialog.getByLabel('Reason').fill('Stocktaking');
    await dialog.getByRole('button', { name: 'Add closure' }).click();
    await expect(page.getByText('Closure added')).toBeVisible();
    const row = page.getByRole('row', { name: /Stocktaking/ });
    await expect(row).toContainText('10:00 – 11:00');
    await expect(row).toContainText('Ramp pool');

    const blocked = await offered();
    expect(blocked).not.toContain('10:00');
    expect(blocked).not.toContain('10:30');
    expect(blocked).toContain('09:30');
    expect(blocked).toContain('11:00');

    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('row', { name: /Stocktaking/ })).toHaveCount(0);
    expect(await offered()).toEqual(all);
  });

  test('public holidays come from the region, can be reopened, and name their source', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await poolWorldDocks(context, w);
    const site = await apiCall<{ id: string }>(
      context,
      'POST',
      `/t/${w.A.tenantId}/sites`,
      newSiteBody('Garching'),
    );
    await page.goto(`/t/${w.A.tenantId}/sites/${site.id}/hours`);
    const christmas = page.getByRole('row', { name: /Christmas Day|1\. Weihnachtstag/ }).first();
    await expect(christmas).toContainText('Public holiday');
    await expect(page.getByRole('link', { name: 'date-holidays' })).toBeVisible();
    await expect(page.getByText('(CC BY-SA 3.0).')).toBeVisible();

    await christmas.getByRole('button', { name: 'Reopen' }).click();
    await expect(page.getByText('Day reopened')).toBeVisible();
    await expect(christmas).toContainText('Reopened');
    await expect(christmas.getByRole('button', { name: 'Reopen' })).toHaveCount(0);
  });
});
