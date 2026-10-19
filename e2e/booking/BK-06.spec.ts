import { expect, test } from '@playwright/test';
import { seedWorld, signInAs } from '../support/auth.ts';
import { at, planSite } from '../support/u6b.ts';
import { berlinDay, carrierBooking, dayButton } from '../support/u8.ts';

test.describe('BK-06 Book again', () => {
  test('a returning carrier books again from an earlier booking in under 3 minutes', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    const earlier = await carrierBooking(request, w.A, site, {
      startsAt: at('10:00', berlinDay(2)),
      units: 12,
    });
    await signInAs(context, w.A.users.carrier_user);

    const started = Date.now();
    await page.goto(`/c/${w.A.carrierId}/bookings`);
    await page.getByRole('link', { name: `Change ${earlier.code}` }).click();
    await page.getByRole('link', { name: 'Book again' }).click();

    // Warehouse, site, load type and units come from the earlier booking: the wizard opens on "When".
    await expect(page.getByRole('heading', { name: 'When' })).toBeVisible();
    await dayButton(page, berlinDay(3)).click();
    await page.getByRole('button', { name: '09:00', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByLabel('Supplier')).toHaveValue('Lieferant GmbH');
    await expect(page.getByLabel('Load unit 1 quantity')).toHaveValue('12');
    await expect(page.getByLabel('Reference 1', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Driver name')).toHaveValue('');
    await page.getByLabel('Reference 1', { exact: true }).fill('PO-90210');
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(
      page.getByRole('heading', { name: 'Booked. The warehouse expects you.' }),
    ).toBeVisible();
    await expect(
      page
        .locator('dd')
        .filter({ hasText: /09:00\s*CES?T/ })
        .first(),
    ).toBeVisible();

    expect(Date.now() - started).toBeLessThan(180_000);
  });
});
