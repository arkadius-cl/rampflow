import { devices, expect, test } from '@playwright/test';
import { StaffLocale } from '../../packages/shared/src/values/locales.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { planSite, siteSetting } from '../support/u6b.ts';
import { dayButton } from '../support/u8.ts';
import { ownAddress } from '../support/u10.ts';
import { setLocale } from '../support/u11.ts';
import { nextSiteDayAt } from '../support/u12.ts';

// Scope NFR "Time zones": every role sees site time with the zone abbreviation, plus their own
// time when it differs. A Bucharest site (UTC+2, summer UTC+3) seen from Berlin is one hour ahead
// all year, because both zones switch daylight saving time at the same instant.

const BUCHAREST = 'Europe/Bucharest';

test.describe('Time zones', () => {
  test('a Bucharest site viewed from Berlin shows site time, its zone and the viewer time', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const w = await seedWorld(request);
    const site = await planSite(w);
    await siteSetting(w, w.A, 'booking.close_on_public_holidays', false);
    const { day } = nextSiteDayAt(BUCHAREST, '10:00');
    const berlin = { ...devices['Desktop Chrome'], timezoneId: 'Europe/Berlin' };

    const admin = await browser.newContext(berlin);
    await signInAs(admin, w.A.users.tenant_admin);
    const adminPage = await admin.newPage();
    await adminPage.goto(`/t/${w.A.tenantId}/sites/${site.siteId}`);
    await adminPage.getByRole('button', { name: 'Edit site' }).click();
    await adminPage.getByRole('dialog').getByLabel('Time zone').selectOption(BUCHAREST);
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(adminPage.getByText(`· ${BUCHAREST}`)).toBeVisible();
    await admin.close();

    const carrier = await browser.newContext(berlin);
    await signInAs(carrier, w.A.users.carrier_user);
    const page = await carrier.newPage();
    await page.goto(`/c/${w.A.carrierId}/book`);
    const siteSelect = page.getByLabel('Site', { exact: true });
    const value = await siteSelect.locator('option', { hasText: 'Site 1' }).getAttribute('value');
    await siteSelect.selectOption(value ?? '');
    await expect(siteSelect.locator('option:checked')).toHaveText(/Site 1 · EES?T/);
    await page.getByLabel('Load units', { exact: true }).fill('4');
    await page.getByRole('button', { name: 'Continue' }).click();
    await dayButton(page, day).click();
    await expect(page.getByText(/Start times in\s*EES?T/)).toBeVisible();
    await page.getByRole('button', { name: '10:00', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Reference 1', { exact: true }).fill('PO-2026');
    await page.getByLabel('Supplier').fill('Elektro Nord AG');
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(
      page.getByRole('heading', { name: 'Booked. The warehouse expects you.' }),
    ).toBeVisible();
    await expect(
      page
        .locator('time')
        .filter({ hasText: /^10:00\s*EES?T\s*\(09:00 your time\)$/ })
        .first(),
    ).toBeVisible();
    await expectAccessible(page);
    const code = ((await page.getByTestId('booking-code').textContent()) ?? '').trim();
    await page.getByRole('link', { name: 'Open booking' }).click();
    const link = new URL(await page.getByLabel('Link for the driver').inputValue());
    const bookingId = new URL(page.url()).pathname.split('/').at(-1) as string;
    await carrier.close();

    // A German dispatcher in Berlin: the zone in German, the own time labelled in German.
    await setLocale(w.A.users.dispatcher.id, StaffLocale.de);
    const dispatcher = await browser.newContext(berlin);
    await signInAs(dispatcher, w.A.users.dispatcher);
    const office = await dispatcher.newPage();
    await office.goto(`/t/${w.A.tenantId}/bookings/${bookingId}`);
    await expect(office.getByText(code).first()).toBeVisible();
    await expect(
      office
        .locator('time')
        .filter({ hasText: /^10:00\s*OESZ?\s*\(09:00 Ihre Zeit\)$/ })
        .first(),
    ).toBeVisible();
    await expectAccessible(office);
    await dispatcher.close();

    // The driver's phone in Berlin shows the slot in site time with its zone.
    const phone = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Europe/Berlin' });
    const driver = await phone.newPage();
    await ownAddress(driver);
    await driver.goto(link.pathname + link.hash);
    await expect(driver.getByTestId('booking-code')).toHaveText(code);
    await expect(driver.getByText(/10:00\s*–\s*10:\d\d\s*EES?T/).first()).toBeVisible();
    await expectAccessible(driver);
    await phone.close();
  });
});
