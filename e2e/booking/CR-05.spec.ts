import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { bookingsOf } from '../support/u5.ts';
import { at, planSite } from '../support/u6b.ts';
import { berlinDay, carrierBooking, linkCarrier } from '../support/u8.ts';

test.describe('CR-05 Bookings across tenants', () => {
  test('one list shows the bookings at two warehouses with filters and the visit; another carrier booking is not found', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const siteA = await planSite(w);
    const siteB = await planSite(w, w.B);
    await linkCarrier(w.B.tenantId, w.A.carrierId);
    const day = berlinDay(2);
    const atA = await carrierBooking(request, w.A, siteA, { startsAt: at('09:00', day) });
    const atB = await carrierBooking(request, w.B, siteB, {
      startsAt: at('11:00', day),
      user: w.A.users.carrier_user,
      carrierId: w.A.carrierId,
    });
    await signInAs(context, w.A.users.carrier_user);

    await page.goto(`/c/${w.A.carrierId}/bookings`);
    const table = page.getByRole('table');
    await expect(table.getByText(atA.code)).toBeVisible();
    await expect(table.getByText(atB.code)).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel('Warehouse').selectOption(w.B.tenantId);
    await expect(table.getByText(atB.code)).toBeVisible();
    await expect(table.getByText(atA.code)).toHaveCount(0);
    await page.getByLabel('Status').selectOption('cancelled');
    await expect(page.getByText('No bookings yet')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(table.getByText(atA.code)).toBeVisible();

    await page.getByRole('link', { name: `Change ${atA.code}` }).click();
    await expect(page.getByText('Visit', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Timeline' }).getByText('Booked')).toBeVisible();
    await expectAccessible(page);

    await page.goto(`/c/${w.A.carrierId}/bookings/${bookingsOf(w.A).rival.id}`);
    await expect(page.getByText('Page not found')).toBeVisible();
  });
});
