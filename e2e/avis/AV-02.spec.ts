import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { at, checkIn, planSite, staffBooking, tieredLoadType } from '../support/u6b.ts';

test.describe('AV-02 Edit the avis (staff)', () => {
  test('a duration change that does not fit answers 409 and keeps the old data; after check-in it saves', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(90_000);
    const w = await seedWorld(request);
    const site = await planSite(w);
    await tieredLoadType(site.loadTypeId);
    const booking = await staffBooking(request, w.A, site, {
      startsAt: at('09:00'),
      resourceId: site.poolId,
      units: 10,
    });
    // With the world's rival booking, 10:00 on the pool of 2 is full: 12 units (120 minutes)
    // from 09:00 no longer fit.
    await staffBooking(request, w.A, site, { startsAt: at('10:00'), resourceId: site.poolId });

    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/bookings/${booking.id}`);
    await expect(page.getByTestId('booking-load')).toContainText('Units: 10');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Load unit 1 quantity').fill('12');
    await page.getByRole('button', { name: 'Save shipment details' }).click();
    await expect(page.getByText('That time is full. Choose another one.')).toBeVisible();
    await expect(page.getByText('The stored shipment details are unchanged.')).toBeVisible();
    await expect(page.getByTestId('booking-load')).toContainText('Units: 10');
    await expect(page.getByTestId('booking-slot')).toContainText(/09:00\s*CET.*09:30\s*CET/);
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByText('10 × EUR pallet')).toBeVisible();

    await checkIn(booking.id);
    await page.reload();
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Load unit 1 quantity').fill('12');
    await page.getByRole('button', { name: 'Save shipment details' }).click();
    await expect(page.getByText('Shipment details saved')).toBeVisible();
    await expect(page.getByTestId('booking-load')).toContainText('Units: 12');
    await expect(page.getByText('12 × EUR pallet')).toBeVisible();
    await expect(page.getByTestId('booking-slot')).toContainText(/09:00\s*CET.*11:00\s*CET/);
    await expect(page.getByText('Shipment details changed')).toBeVisible();
  });
});
