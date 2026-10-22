import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/auth.ts';
import { driverWorld, linkOf, ownAddress } from '../support/u10.ts';

const slotLabel = (locale: string) =>
  (
    JSON.parse(readFileSync(`packages/i18n/locales/${locale}/driver/app.json`, 'utf8')) as {
      booking: { slot: string };
    }
  ).booking.slot;

test.describe('DR-02 Language', () => {
  test.describe('with a German phone', () => {
    test.use({ locale: 'de-DE' });
    test('the browser language picks the locale, without the machine badge', async ({
      page,
      request,
    }) => {
      await ownAddress(page);
      const w = await driverWorld(request);
      await page.goto(linkOf(w.A.bookings.own.driverToken));
      await expect(page.getByText('Ihr Zeitfenster')).toBeVisible();
      await expect(page.getByLabel('Sprache')).toHaveValue('de');
      await expect(page.getByTestId('machine-badge')).toHaveCount(0);
    });
  });

  test.describe('with a French phone', () => {
    test.use({ locale: 'fr-FR' });
    test('an unknown language falls back to English', async ({ page, request }) => {
      await ownAddress(page);
      const w = await driverWorld(request);
      await page.goto(linkOf(w.A.bookings.own.driverToken));
      await expect(page.getByText('Your slot')).toBeVisible();
      await expect(page.getByLabel('Language')).toHaveValue('en');
    });
  });

  test('the switcher changes the language in one step, badges machine translations and remembers it', async ({
    page,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    await page.goto(linkOf(w.A.bookings.own.driverToken));
    await expect(page.getByText('Your slot')).toBeVisible();

    await page.getByLabel('Language').selectOption('ro');
    await expect(page.getByText(slotLabel('ro'))).toBeVisible();
    await expect(page.getByTestId('machine-badge')).toContainText('auto');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    await expectAccessible(page);

    await page.reload();
    await expect(page.getByText(slotLabel('ro'))).toBeVisible();

    // The theme switch is a second select; the language one is the select that offers the locales.
    const language = page.getByRole('combobox').filter({ has: page.locator('option[value="pl"]') });
    await language.selectOption('pl');
    await expect(page.getByText(slotLabel('pl'))).toBeVisible();
    await expect(page.getByTestId('machine-badge')).toContainText('auto');

    await language.selectOption('de');
    await expect(page.getByText(slotLabel('de'))).toBeVisible();
    await expect(page.getByTestId('machine-badge')).toHaveCount(0);
  });
});
