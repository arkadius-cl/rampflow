import { expect, type Page, test } from '@playwright/test';
import { OnSiteStatus } from '../../packages/shared/src/modules/booking/values.ts';
import { expectAccessible } from '../support/auth.ts';
import {
  driverWorld,
  linkOf,
  ownAddress,
  previewLinkOf,
  setVisit,
  writeCounts,
} from '../support/u10.ts';

/** The PWA polls at once when it becomes visible again; the spec uses that instead of waiting. */
const pollNow = (page: Page) =>
  page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");

test.describe('DR-03 Wait and dock call', () => {
  test('a check-in shows "wait" and a call appears within 20 seconds while the page is open', async ({
    page,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    const booking = w.A.bookings.own;
    await page.goto(linkOf(booking.driverToken));
    await expect(page.getByTestId('booking-code')).toHaveText(booking.code);

    await setVisit(booking, OnSiteStatus.checked_in);
    await pollNow(page);
    await expect(page.getByRole('heading', { name: 'Please wait' })).toBeVisible();
    await expectAccessible(page);

    // The real 15-second poll, no nudge: the call must show within 20 seconds.
    const { dockCode, hall } = await setVisit(booking, OnSiteStatus.called);
    await expect(page.getByTestId('dock-code')).toHaveText(dockCode, { timeout: 20_000 });
    await expect(page.getByText(`Go to dock ${dockCode}, hall ${hall}`)).toBeVisible();
    await expectAccessible(page);
  });

  test('offline it shows the last known state with its time, and polls write no rows', async ({
    page,
    context,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    const booking = w.A.bookings.own;
    await page.goto(linkOf(booking.driverToken));
    await expect(page.getByTestId('booking-code')).toHaveText(booking.code);

    const before = await writeCounts(w.A.tenantId);
    for (let i = 0; i < 3; i++) {
      const poll = page.waitForResponse('**/api/driver/booking');
      await pollNow(page);
      expect((await poll).status()).toBe(200);
    }
    expect(await writeCounts(w.A.tenantId)).toEqual(before);

    await context.setOffline(true);
    await pollNow(page);
    await expect(page.getByRole('status')).toContainText(
      /Offline\. Showing status from \d\d:\d\d /,
    );
    await expect(page.getByTestId('booking-code')).toHaveText(booking.code);

    await context.setOffline(false);
    await pollNow(page);
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('a new link opened offline says so instead of showing the previous booking', async ({
    page,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    await page.goto(linkOf(w.A.bookings.own.driverToken));
    await expect(page.getByTestId('booking-code')).toHaveText(w.A.bookings.own.code);

    // The service worker serves the shell offline; the exchange itself needs the network.
    await page.route('**/api/public/driver-session', (route) =>
      route.abort('internetdisconnected'),
    );
    await page.goto(linkOf(w.A.bookings.otherSite.driverToken));
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    await expect(page.getByTestId('booking-code')).toHaveCount(0);
  });

  test('reopened offline, the installed PWA shows the cached state of this phone', async ({
    page,
    context,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    const booking = w.A.bookings.own;
    await page.goto(previewLinkOf(booking.driverToken));
    await expect(page.getByTestId('booking-code')).toHaveText(booking.code);
    await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
    // Once the service worker controls the page, its booking answer lands in the cache.
    await page.reload();
    await expect(page.getByTestId('booking-code')).toHaveText(booking.code);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('booking-code')).toHaveText(booking.code);
    await expect(page.getByRole('status')).toContainText(
      /Offline\. Showing status from \d\d:\d\d /,
    );
  });
});
