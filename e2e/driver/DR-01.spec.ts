import { expect, test } from '@playwright/test';
import { CookieName } from '../../packages/shared/src/values/http.ts';
import { expectAccessible } from '../support/auth.ts';
import {
  APP_ORIGIN,
  driverWorld,
  linkOf,
  ownAddress,
  personalDataOf,
  previewLinkOf,
  randomAddress,
  revokeLink,
} from '../support/u10.ts';

test.describe('DR-01 Open the link', () => {
  test('the link opens the booking, the token leaves the URL and no request carries it', async ({
    page,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    const booking = w.A.bookings.own;
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));

    await page.goto(linkOf(booking.driverToken));
    await expect(page.getByTestId('booking-code')).toHaveText(booking.code);
    await expect(page).toHaveURL(/\/d\/$/);
    expect(new URL(page.url()).hash).toBe('');

    await expect(page.getByText('Your slot')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open in maps' })).toHaveAttribute(
      'href',
      /^https:\/\/www\.google\.com\/maps\/search\//,
    );
    await expect(
      page.getByRole('img', { name: `QR code of booking ${booking.code}` }),
    ).toBeVisible();
    await expect(page.getByText('Confirmed')).toBeVisible();
    await expect(page.getByText('This page shows no personal data.')).toBeVisible();

    expect(urls.filter((u) => u.includes(booking.driverToken))).toEqual([]);
    const text = (await page.locator('body').textContent()) ?? '';
    for (const personal of await personalDataOf(booking)) expect(text).not.toContain(personal);

    const cookies = await page.context().cookies();
    const driver = cookies.find((c) => c.name === CookieName.rf_driver);
    expect(driver).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/driver' });
    await expectAccessible(page);
  });

  test('the PWA answers without a referrer', async ({ page, request }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    const res = await page.goto(linkOf(w.A.bookings.own.driverToken));
    expect(res?.headers()['referrer-policy']).toBe('no-referrer');
  });

  test('unknown, revoked and tampered links show one generic message', async ({
    page,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    await revokeLink(w.A.bookings.rival);
    for (const token of [
      'nonsense',
      w.A.bookings.rival.driverToken,
      `${w.A.bookings.own.driverToken}x`,
    ]) {
      await page.goto(linkOf(token));
      await expect(
        page.getByRole('heading', { name: 'This link is no longer valid' }),
      ).toBeVisible();
      await expect(page.getByText('Ask your dispatcher for a new one.')).toBeVisible();
    }
    await expectAccessible(page);
  });

  test('the eleventh exchange in a minute from one address answers 429', async ({ request }) => {
    const w = await driverWorld(request);
    const headers = { 'X-Forwarded-For': randomAddress(), Origin: APP_ORIGIN };
    const exchange = () =>
      request.post('/api/public/driver-session', {
        headers,
        data: { token: w.A.bookings.own.driverToken },
      });
    for (let i = 0; i < 10; i++) expect((await exchange()).status()).toBe(204);
    expect((await exchange()).status()).toBe(429);
  });

  test('the production build renders the booking within 3 s on a throttled phone', async ({
    page,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    const cdp = await page.context().newCDPSession(page);
    // Lighthouse's mobile profile: 150 ms round trip, 1.6 Mbit/s down, 4x slower CPU.
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const res = await page.goto(previewLinkOf(w.A.bookings.own.driverToken));
    await expect(page.getByTestId('booking-code')).toHaveText(w.A.bookings.own.code);
    // The browser's own paint time of the booking code, from navigation start (Element Timing).
    const renderedAt = await page.evaluate<number>(`new Promise((resolve) =>
      new PerformanceObserver((list) => {
        const entry = list.getEntries().find((e) => e.identifier === 'booking-code');
        if (entry) resolve(entry.renderTime || entry.loadTime);
      }).observe({ type: 'element', buffered: true }))`);
    test
      .info()
      .annotations.push({ type: 'first render', description: `${Math.round(renderedAt)} ms` });
    expect(renderedAt).toBeLessThan(3_000);
    expect(res?.headers()['content-security-policy']).toContain("default-src 'self'");
  });
});
