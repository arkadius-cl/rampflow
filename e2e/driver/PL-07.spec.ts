import { expect, test } from '@playwright/test';
import { asPlatformAdmin, suspendTenant } from '../support/u3.ts';
import { driverWorld, linkOf, ownAddress } from '../support/u10.ts';

// The driver step of PL-07 in the Pixel project; the staff steps are in e2e/core/PL-07.spec.ts.

test.describe('PL-07 Suspend and reactivate', () => {
  test('the driver link of a suspended tenant is invalid until the reactivation', async ({
    page,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    const booking = w.A.bookings.own;
    await page.goto(linkOf(booking.driverToken));
    await expect(page.getByTestId('booking-code')).toHaveText(booking.code);

    await suspendTenant(request, w, w.A.tenantId, 'Unpaid since March');
    await page.goto(linkOf(booking.driverToken));
    await expect(page.getByRole('heading', { name: 'This link is no longer valid' })).toBeVisible();
    await expect(page.getByTestId('booking-code')).toHaveCount(0);

    const res = await request.post(`/api/platform/tenants/${w.A.tenantId}/reactivate`, {
      headers: asPlatformAdmin(w),
      data: { reason: 'Paid in full' },
    });
    expect(res.status(), await res.text()).toBe(200);
    await page.goto(linkOf(booking.driverToken));
    await expect(page.getByTestId('booking-code')).toHaveText(booking.code);
  });
});
