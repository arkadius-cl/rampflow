import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { uniqueEmail } from '../support/db.ts';
import { at, planSite } from '../support/u6b.ts';
import { emailMatching } from '../support/u7.ts';
import { berlinDay, carrierBooking, driverLinks } from '../support/u8.ts';

/** The browser globals this spec touches; the e2e project compiles without the DOM types. */
interface Browser {
  navigator: { clipboard: { readText(): Promise<string> } };
  shared?: { url: string };
}

test.describe('CR-06 Share the driver link', () => {
  test('copy, share sheet, email in the driver language, and regenerate revokes the old link', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    const booking = await carrierBooking(request, w.A, site, {
      startsAt: at('10:00', berlinDay(2)),
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // The Web Share API exists on phones; the stub records what the share sheet would get.
    await context.addInitScript(() => {
      const page = globalThis as unknown as Browser;
      Object.defineProperty(page.navigator, 'share', {
        value: (data: { url: string }) => {
          page.shared = data;
          return Promise.resolve();
        },
      });
    });
    await signInAs(context, w.A.users.carrier_user);
    await page.goto(`/c/${w.A.carrierId}/bookings/${booking.id}`);

    const linkField = page.getByLabel('Link for the driver');
    await expect(linkField).toHaveValue(/\/d#[\w-]{43}$/);
    const first = await linkField.inputValue();
    await page.getByRole('button', { name: 'Copy' }).click();
    await expect(page.getByText('Link copied')).toBeVisible();
    expect(
      await page.evaluate(() => (globalThis as unknown as Browser).navigator.clipboard.readText()),
    ).toBe(first);

    await page.getByRole('button', { name: 'Share…' }).click();
    await expect
      .poll(() => page.evaluate(() => (globalThis as unknown as Browser).shared?.url))
      .toBe(first);
    await expectAccessible(page);

    const driver = uniqueEmail('driver');
    await page.getByLabel('Email to driver').fill(driver);
    await page.getByLabel("Driver's language").selectOption('uk');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(`Link sent to ${driver}`)).toBeVisible();
    const mail = await emailMatching(driver, new RegExp(booking.code));
    expect(mail.subject).toContain('Ваше посилання водія');

    await page.getByRole('button', { name: 'Regenerate link' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Regenerate the driver link?' });
    await confirm.getByRole('button', { name: 'Regenerate link' }).click();
    await expect(page.getByText('New driver link created')).toBeVisible();
    await expect(linkField).not.toHaveValue(first);
    const [current, old] = await driverLinks(booking.id);
    expect(current?.revoked_at).toBeNull();
    expect(old?.revoked_at).not.toBeNull();
  });

  test('an email typed while the booking page loads survives until Send', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    const booking = await carrierBooking(request, w.A, site, {
      startsAt: at('10:00', berlinDay(2)),
    });
    // A slow connection: the booking page's code arrives only after the driver's email is typed.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      /\/routes\/c\/(\$|%24)orgId\/bookings\/(\$|%24)bookingId\.tsx\?tsr-split/,
      async (r) => {
        await held;
        await r.continue();
      },
    );
    await signInAs(context, w.A.users.carrier_user);
    await page.goto(`/c/${w.A.carrierId}/book?step=done&booking=${booking.id}`);
    await expect(page.getByLabel('Link for the driver')).toHaveValue(/\/d#[\w-]{43}$/);

    await page.getByRole('link', { name: 'Open booking' }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${w.A.carrierId}/bookings/${booking.id}$`));
    const driver = uniqueEmail('driver');
    await page.getByLabel('Email to driver').fill(driver);
    await page.getByLabel("Driver's language").selectOption('pl');
    release();
    await expect(page.getByRole('link', { name: 'All bookings' })).toBeVisible();
    await expect(page.getByLabel('Email to driver')).toHaveValue(driver);
    await expect(page.getByLabel("Driver's language")).toHaveValue('pl');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(`Link sent to ${driver}`)).toBeVisible();
  });
});
