import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { acknowledge, bookingsOf, publishedBriefing } from '../support/u5.ts';
import { avisOf, setDriver } from '../support/u11.ts';

test.describe('TN-06 Data subject requests', () => {
  test('a tenant admin finds a driver, exports the data and erases it', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const { own, rival } = bookingsOf(w.A);
    await setDriver(own.id, { name: 'Jan Kowalski', phone: '+48600123456', plate: 'WA12345' });
    await setDriver(rival.id, { name: 'Anna Nowak', phone: null, plate: 'HH1234' });
    const briefing = await publishedBriefing(request, w.A, 'Site rules');
    await acknowledge({
      side: w.A,
      instructionId: briefing.id,
      booking: own,
      driverName: 'Jan Kowalski',
      completedAt: new Date(Date.now() - 86_400_000),
      validDays: 365,
    });

    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/privacy`);
    await expect(page.getByRole('heading', { name: 'Privacy requests' })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('Enter a name, phone or plate.')).toBeVisible();

    await page.getByLabel('Plate').fill('wa 12345');
    await page.getByRole('button', { name: 'Search' }).click();
    const bookings = page.getByRole('region', { name: /Bookings/ });
    await expect(bookings.getByRole('row', { name: new RegExp(own.code) })).toContainText(
      'Jan Kowalski',
    );
    await expect(bookings.getByText(rival.code)).toHaveCount(0);
    const acks = page.getByRole('region', { name: /Safety acknowledgements/ });
    await expect(acks.getByRole('row', { name: /Jan Kowalski/ })).toContainText(
      'Kept until retention ends',
    );
    await expectAccessible(page);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const file = JSON.parse(await readFile(await (await download).path(), 'utf8')) as {
      bookings: { code: string; driverPhone: string }[];
      acknowledgements: { driverName: string }[];
    };
    expect(file.bookings).toEqual([
      expect.objectContaining({ code: own.code, driverPhone: '+48600123456' }),
    ]);
    expect(file.acknowledgements).toEqual([
      expect.objectContaining({ driverName: 'Jan Kowalski' }),
    ]);

    await page.getByRole('button', { name: 'Erase' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('to pseudonymize (name, phone and plates removed): 1');
    await expect(dialog).toContainText('still under retention, to restrict: 1');
    const erase = dialog.getByRole('button', { name: 'Erase data' });
    await expect(erase).toBeDisabled();
    await dialog.getByRole('checkbox').check();
    await erase.click();
    await expect(
      page.getByText('Done: 1 bookings pseudonymized, 1 acknowledgements restricted'),
    ).toBeVisible();

    await expect(bookings.getByRole('row')).toHaveCount(0);
    expect(await avisOf(own.id)).toMatchObject({
      driver_name: null,
      driver_phone: null,
      plate: null,
    });
    expect((await avisOf(rival.id))?.plate).toBe('HH1234');
  });

  test('a dispatcher has no privacy requests', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/privacy`);
    await expect(page.getByText('No access')).toBeVisible();
  });
});
