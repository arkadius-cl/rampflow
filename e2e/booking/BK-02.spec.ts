import { expect, type Page, test } from '@playwright/test';
import { seedWorld, signInAs } from '../support/auth.ts';
import { at, planSite, siteSetting, staffBooking, WORLD_DAY } from '../support/u6b.ts';

async function fillAvis(page: Page, o: { reference: string; units: string }) {
  const sheet = page.getByRole('dialog', { name: 'New booking' });
  await sheet.getByLabel('Reference 1', { exact: true }).fill(o.reference);
  await sheet.getByLabel('Supplier').fill('Lieferant GmbH');
  await sheet.getByLabel('Load unit 1 quantity').fill(o.units);
}

test.describe('BK-02 Staff booking', () => {
  test('a dispatcher books a linked carrier without lead time and horizon', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    // A carrier could not book the world day under these rules; staff can.
    await siteSetting(w, w.A, 'booking.min_lead_minutes', 10080);
    await siteSetting(w, w.A, 'booking.horizon_days', 1);

    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/plan?site=${site.siteId}&date=${WORLD_DAY}`);
    await page.getByRole('button', { name: 'New booking' }).click();
    const sheet = page.getByRole('dialog', { name: 'New booking' });
    await expect(sheet.getByText('Start times in CET')).toBeVisible();
    await sheet.getByLabel('Carrier name').selectOption({ index: 1 });
    await sheet.getByRole('button', { name: '11:00', exact: true }).click();
    await fillAvis(page, { reference: 'PO-77001', units: '6' });
    await sheet.getByRole('button', { name: 'Book', exact: true }).click();

    await expect(sheet).toBeHidden();
    const panel = page.getByRole('complementary', { name: 'Booking detail' });
    await expect(panel.getByRole('heading', { name: /^Carrier A/ })).toBeVisible();
    await expect(panel.locator('time').first()).toHaveText(/^11:00\s*CET/);
    await expect(panel.getByText('PO-77001')).toBeVisible();
    const pool = page.getByRole('region', { name: 'Ramp pool' });
    await expect(pool.locator('[data-slot-time="11:00"]')).toHaveText('1/2');
  });

  test('at a full slot the dispatcher books over capacity only with a reason, which the event log keeps', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    // With the world's own booking, 09:00 on the pool of 2 is full.
    await staffBooking(request, w.A, site, { startsAt: at('09:00'), resourceId: site.poolId });

    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/plan?site=${site.siteId}&date=${WORLD_DAY}&new=1`);
    const sheet = page.getByRole('dialog', { name: 'New booking' });
    await sheet.getByRole('radio', { name: 'Other company' }).click();
    await sheet.getByLabel('Carrier name').fill('Spedition Nord');
    await sheet.getByLabel('Resource').selectOption({ label: 'Ramp pool' });
    const nine = sheet.getByRole('button', { name: /^09:00/ });
    await expect(nine).toContainText('full');
    await nine.click();
    await expect(sheet.getByText('This time is full')).toBeVisible();
    await fillAvis(page, { reference: 'PO-77002', units: '4' });

    await sheet.getByRole('button', { name: 'Book over capacity' }).click();
    await expect(sheet.getByText('Give a reason for booking over capacity.')).toBeVisible();
    await sheet.getByLabel('Reason for booking over capacity').fill('Urgent spare parts');
    await sheet.getByRole('button', { name: 'Book over capacity' }).click();

    await expect(sheet).toBeHidden();
    const panel = page.getByRole('complementary', { name: 'Booking detail' });
    await expect(panel.getByRole('heading', { name: 'Spedition Nord' })).toBeVisible();
    await expect(panel.getByText('Booked over capacity')).toBeVisible();
    await expect(panel.getByText('Reason: Urgent spare parts')).toBeVisible();
    const pool = page.getByRole('region', { name: 'Ramp pool' });
    await expect(pool.locator('[data-slot-time="09:00"]')).toHaveText('3/2');
  });

  test('a gate operator sees the board but no "New booking"', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    await signInAs(context, w.A.users.gate_operator);
    await page.goto(`/t/${w.A.tenantId}/plan?site=${site.siteId}&date=${WORLD_DAY}&new=1`);
    await expect(page.getByRole('region', { name: 'Ramp pool' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New booking' })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Walk-in now' })).toHaveAttribute(
      'href',
      `/t/${w.A.tenantId}/gate?site=${site.siteId}&walkin=1`,
    );
  });
});
