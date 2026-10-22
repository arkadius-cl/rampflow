import { expect, test } from '@playwright/test';
import { seedWorld, signInAs } from '../support/auth.ts';
import { at, planSite, siteSetting } from '../support/u6b.ts';
import { berlinDay, carrierBooking, driverLinks, setSitePhone } from '../support/u8.ts';

const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`;

test.describe('BK-05 Change and cancel', () => {
  test('before the cutoff the carrier changes the time, then cancels, which revokes the driver link', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    const day = berlinDay(2);
    const booking = await carrierBooking(request, w.A, site, { startsAt: at('10:00', day) });
    await signInAs(context, w.A.users.carrier_user);
    await page.goto(`/c/${w.A.carrierId}/bookings/${booking.id}`);

    await page.getByRole('button', { name: 'Change time' }).click();
    const dialog = page.getByRole('dialog', { name: `Change time of ${booking.code}` });
    await dialog.getByRole('button', { name: '11:00', exact: true }).click();
    await dialog.getByRole('button', { name: 'Change time' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Time changed')).toBeVisible();
    await expect(page.getByRole('main')).toContainText(/11:00\s*CES?T/);

    await page.getByRole('button', { name: 'Cancel booking' }).click();
    const confirm = page.getByRole('alertdialog', { name: `Cancel booking ${booking.code}?` });
    await confirm.getByLabel('Reason (optional)').fill('Ware nicht fertig');
    await confirm.getByRole('button', { name: 'Cancel booking' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('This booking has no active driver link.')).toBeVisible();
    const links = await driverLinks(booking.id);
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => l.revoked_at !== null)).toBe(true);
  });

  test('after the cutoff both actions are disabled, the site phone shows and the API answers 409', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    const booking = await carrierBooking(request, w.A, site, {
      startsAt: at('10:00', berlinDay(2)),
    });
    await setSitePhone(site.siteId, '+49 40 123 456');
    // A week of cutoff puts a booking two days ahead past it.
    await siteSetting(w, w.A, 'booking.cancel_cutoff_minutes', 10080);
    await signInAs(context, w.A.users.carrier_user);
    await page.goto(`/c/${w.A.carrierId}/bookings/${booking.id}`);

    await expect(page.getByRole('button', { name: 'Change time' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel booking' })).toBeDisabled();
    await expect(page.getByText('Changes are closed for this booking.')).toBeVisible();
    await expect(page.getByRole('link', { name: '+49 40 123 456' }).first()).toHaveAttribute(
      'href',
      'tel:+49 40 123 456',
    );

    const cancel = await request.post(
      `/api/c/${w.A.carrierId}/at/${w.A.tenantId}/bookings/${booking.id}/cancel`,
      {
        data: {},
        headers: {
          Cookie: `rf_session=${w.A.users.carrier_user.sessionToken}`,
          Origin: APP_ORIGIN,
        },
      },
    );
    expect(cancel.status()).toBe(409);
    expect(await cancel.json()).toMatchObject({ error: { details: { reason: 'cutoff_passed' } } });

    await page.goto(`/c/${w.A.carrierId}/bookings`);
    await expect(page.getByRole('link', { name: `Details ${booking.code}` })).toBeVisible();
  });
});
