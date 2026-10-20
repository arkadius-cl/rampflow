import { randomUUID } from 'node:crypto';
import { expect, type Locator, test } from '@playwright/test';
import { HttpMethod } from '../../packages/shared/src/values/http.ts';
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
      HttpMethod.POST,
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

  test('final bookings take a lane of their own, so no card covers another', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    const cancel = async (startsAt: string) => {
      const b = await staffBooking(request, w.A, site, { startsAt, resourceId: site.poolId });
      await apiAs(
        request,
        w.A.users.dispatcher,
        HttpMethod.POST,
        `/t/${w.A.tenantId}/bookings/${b.id}/cancel`,
        {},
      );
      return b;
    };
    const cancelled = [await cancel(at('09:00')), await cancel(at('09:30'))];
    await staffBooking(request, w.A, site, { startsAt: at('09:30'), resourceId: site.poolId });

    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/plan?site=${site.siteId}&date=${WORLD_DAY}`);
    const pool = page.getByRole('region', { name: 'Ramp pool' });
    for (const b of cancelled) {
      await expect(pool.locator(`[data-booking-code="${b.code}"]`)).toContainText('Cancelled');
    }
    const cards = await boxes(pool.locator('[data-booking-code]'));
    expect(cards.length).toBeGreaterThanOrEqual(4);
    const overlaps = cards.flatMap((a, i) =>
      cards
        .slice(i + 1)
        .filter((b) => intersects(a, b))
        .map((b) => `${a.code} covers ${b.code}`),
    );
    expect(overlaps).toEqual([]);
  });

  test('the resource header stays in view while the day scrolls', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w, w.A, ['00:00', '24:00']);
    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/plan?site=${site.siteId}&date=${WORLD_DAY}`);
    const header = page.getByText('Pool · up to 2 per slot');
    await expect(header).toBeInViewport();
    await page.getByText('16:00', { exact: true }).scrollIntoViewIfNeeded();
    await expect(header).toBeInViewport();
  });

  test('today shows a now line in site time with the zone label', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w, w.A, ['00:00', '24:00']);
    await signInAs(context, w.A.users.dispatcher);
    // The page and the assertion read one frozen instant, so a full hour cannot pass in between.
    const at = new Date();
    await context.clock.setFixedTime(at);
    await page.goto(`/t/${w.A.tenantId}/plan?site=${site.siteId}`);
    const now = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at);
    await expect(page.getByTestId('now-line')).toContainText(/\d{2}:\d{2}\s*CES?T/);
    await expect(page.getByTestId('now-line')).toContainText(now.slice(0, 2));
    await expect(page.getByRole('button', { name: 'Today' })).toBeDisabled();
    // A 24/7 site opens on the current time, not at midnight.
    await expect(page.getByTestId('now-line').getByText(/\d{2}:\d{2}/)).toBeInViewport();
  });
});

interface Box {
  code: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxes(cards: Locator): Promise<Box[]> {
  return Promise.all(
    (await cards.all()).map(async (card) => ({
      code: (await card.getAttribute('data-booking-code')) ?? '',
      ...((await card.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 }),
    })),
  );
}

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
