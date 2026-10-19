import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { apiAs, bookingsOf } from '../support/u5.ts';
import { at, avis, ownBooking, planSite, staffBooking, WORLD_DAY, walkIn } from '../support/u6b.ts';

test.describe('BK-01 Plan board', () => {
  test('pools show booked against capacity per slot, over-capacity is flagged, times carry the zone', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    // 09:00: the world's own booking, one more and a forced third on the pool of 2.
    await staffBooking(request, w.A, site, { startsAt: at('09:00'), resourceId: site.poolId });
    const forced = await staffBooking(request, w.A, site, {
      startsAt: at('09:00'),
      resourceId: site.poolId,
      forceReason: 'Customer escalation',
    });
    const walked = await walkIn(w.A, site, at('05:30'), 'Nachtfahrt GmbH');
    const single = await staffBooking(request, w.A, site, {
      startsAt: at('12:00'),
      resourceId: site.singleId,
      carrier: { name: 'Frigo Express' },
    });

    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/plan?site=${site.siteId}&date=${WORLD_DAY}`);
    const pool = page.getByRole('region', { name: 'Ramp pool' });
    const reefer = page.getByRole('region', { name: 'Reefer A-05' });
    await expect(pool).toBeVisible();
    await expect(reefer).toBeVisible();
    await expect(page.getByText('Pool · up to 2 per slot')).toBeVisible();
    await expect(page.getByText('Single dock')).toBeVisible();

    const slot = (time: string) => pool.locator(`[data-slot-time="${time}"]`);
    await expect(slot('09:00')).toHaveText('3/2');
    await expect(slot('09:00')).toHaveAttribute('data-over', 'true');
    await expect(slot('10:00')).toHaveText('1/2');
    await expect(slot('10:00')).not.toHaveAttribute('data-over');
    await expect(slot('05:30')).toHaveText('1/0');
    await expect(slot('05:30')).toHaveAttribute('data-over', 'true');

    const card = (code: string) => page.locator(`[data-booking-code="${code}"]`);
    await expect(card(forced.code).getByRole('img', { name: 'Over capacity' })).toBeVisible();
    await expect(card(walked.code).getByRole('img', { name: 'Over capacity' })).toBeVisible();
    await expect(card(bookingsOf(w.A).rival.code).getByRole('img')).toHaveCount(0);
    await expect(reefer.locator(`[data-booking-code="${single.code}"]`)).toContainText(
      'Frigo Express',
    );
    // Monday 2 November 2026 is winter time in Berlin.
    await expect(page.getByText('CET', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('CEST')).toHaveCount(0);

    await card(forced.code).click();
    const panel = page.getByRole('complementary', { name: 'Booking detail' });
    await expect(panel.getByText(forced.code)).toBeVisible();
    await expect(panel.getByText('Booked over capacity')).toBeVisible();
    await expect(panel.getByText('Over capacity', { exact: true })).toBeVisible();
    await expect(panel.locator('time').first()).toHaveText(/^09:00\s*CET/);
    await expect(panel.getByText('Reason: Customer escalation')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`booking=${forced.id}`));

    await page.getByRole('button', { name: 'List', exact: true }).click();
    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toContainText(walked.code);
    await expect(rows.first()).toContainText('Walk-in');
    await expect(rows.first().locator('time').first()).toHaveText(/^05:30\s*CET/);
    await expect(page.getByRole('row', { name: new RegExp(forced.code) })).toContainText(
      'Booked over capacity',
    );
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Next day' }).click();
    await expect(page.getByTestId('plan-day')).toHaveText('Tue, 3 Nov 2026');
    await expect(page.getByText('No bookings on this day.')).toBeVisible();
  });

  test('a booking made in a second browser context appears within 30 seconds', async ({
    page,
    context,
    browser,
    request,
  }) => {
    test.setTimeout(90_000);
    const w = await seedWorld(request);
    const site = await planSite(w);
    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/plan?site=${site.siteId}&date=${WORLD_DAY}`);
    await expect(page.locator(`[data-booking-code="${ownBooking(w.A).code}"]`)).toBeVisible();

    const other = await browser.newContext();
    await signInAs(other, w.A.users.dispatcher);
    const made = await apiAs<{ code: string }>(
      other.request,
      w.A.users.dispatcher,
      'POST',
      `/t/${w.A.tenantId}/bookings`,
      {
        clientRequestId: randomUUID(),
        siteId: site.siteId,
        loadTypeId: site.loadTypeId,
        startsAt: at('14:00'),
        carrier: { name: 'Elsewhere Logistics' },
        avis: avis(),
      },
    );
    await other.close();

    await expect(page.locator(`[data-booking-code="${made.code}"]`)).toContainText(
      'Elsewhere Logistics',
      { timeout: 30_000 },
    );
  });

  test('today shows a now line in site time with the zone label', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w, w.A, ['00:00', '24:00']);
    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/plan?site=${site.siteId}`);
    const now = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
    await expect(page.getByTestId('now-line')).toContainText(/\d{2}:\d{2}\s*CES?T/);
    await expect(page.getByTestId('now-line')).toContainText(now.slice(0, 2));
    await expect(page.getByRole('button', { name: 'Today' })).toBeDisabled();
  });
});
