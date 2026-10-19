import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { planSite, siteSetting, WORLD_DAY } from '../support/u6b.ts';

test.describe('AV-01 Avis (staff)', () => {
  test('the staff sheet shows schema and site-rule errors under their fields and stores normalized values', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(90_000);
    const w = await seedWorld(request);
    const site = await planSite(w);
    await siteSetting(w, w.A, 'booking.require_plate', true);

    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/plan?site=${site.siteId}&date=${WORLD_DAY}&new=1`);
    const sheet = page.getByRole('dialog', { name: 'New booking' });
    await sheet.getByRole('radio', { name: 'Other company' }).click();
    await sheet.getByLabel('Carrier name').fill('Spedition Süd');
    await sheet.getByRole('button', { name: '10:30', exact: true }).click();
    await sheet.getByLabel('Reference 1', { exact: true }).fill('DN-2026-114');
    await sheet.getByLabel('Supplier').fill('Chemie AG');
    await sheet.getByLabel('Load unit 1 quantity').fill('3');
    await sheet.getByRole('checkbox', { name: 'Dangerous goods' }).click();
    await sheet.getByLabel('UN number').fill('UN123');
    await sheet.getByLabel('ADR class').selectOption('3');
    await expectAccessible(page);

    await sheet.getByRole('button', { name: 'Book', exact: true }).click();
    await expect(
      sheet.getByRole('alert').filter({ hasText: 'UN followed by four digits' }),
    ).toBeVisible();
    await expect(sheet.getByLabel('UN number')).toHaveAttribute('aria-invalid', 'true');

    await sheet.getByLabel('UN number').fill('un 1203');
    await sheet.getByRole('button', { name: 'Book', exact: true }).click();
    // The schema passes; the site's require_plate rule answers 422 at avis.vehicle.plate.
    const plate = sheet.getByLabel('Plate', { exact: true });
    await expect(plate).toHaveAttribute('aria-invalid', 'true');
    await expect(
      sheet.getByRole('alert').filter({ hasText: 'Required at this site' }),
    ).toBeVisible();
    await expect(sheet.getByRole('alert')).toHaveCount(1);

    await plate.fill('hh-ab 123');
    await sheet.getByLabel('Driver phone').fill('0049 151 2345678');
    await sheet.getByRole('button', { name: 'Book', exact: true }).click();
    await expect(sheet).toBeHidden();

    await page
      .getByRole('complementary', { name: 'Booking detail' })
      .getByRole('link', { name: 'Open booking' })
      .click();
    await expect(page.getByRole('heading', { name: 'Spedition Süd' })).toBeVisible();
    const details = page.getByRole('definition');
    await expect(details.filter({ hasText: 'HHAB123' })).toBeVisible();
    await expect(details.filter({ hasText: '+491512345678' })).toBeVisible();
    await expect(details.filter({ hasText: 'UN1203 · 3' })).toBeVisible();
    await expect(details.filter({ hasText: 'Purchase order: DN-2026-114' })).toBeVisible();
  });
});
