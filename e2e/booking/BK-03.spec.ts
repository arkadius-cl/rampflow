import { expect, test } from '@playwright/test';
import { seedWorld, signInAs } from '../support/auth.ts';
import {
  at,
  checkIn,
  emailWithSubject,
  planSite,
  staffBooking,
  WORLD_DAY,
} from '../support/u6b.ts';

test.describe('BK-03 Staff edit and cancel', () => {
  test('staff reschedule and cancel before check-in, and the carrier gets an email for each change', async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(90_000);
    const w = await seedWorld(request);
    const site = await planSite(w);
    const booking = await staffBooking(request, w.A, site, { startsAt: at('11:00') });
    const carrierAdmin = w.A.users.carrier_admin.email;
    await emailWithSubject(carrierAdmin, `Booking ${booking.code} confirmed`);

    await signInAs(context, w.A.users.dispatcher);
    await page.goto(
      `/t/${w.A.tenantId}/plan?site=${site.siteId}&date=${WORLD_DAY}&booking=${booking.id}`,
    );
    const panel = page.getByRole('complementary', { name: 'Booking detail' });
    await panel.getByRole('button', { name: 'Reschedule' }).click();
    const dialog = page.getByRole('dialog', { name: `Reschedule ${booking.code}` });
    await dialog.getByRole('button', { name: '13:30', exact: true }).click();
    await dialog.getByRole('button', { name: 'Reschedule', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.locator('time').first()).toHaveText(/^13:30\s*CET/);
    await expect(panel.getByText('Rescheduled')).toBeVisible();
    const changed = await emailWithSubject(carrierAdmin, `Booking ${booking.code} changed`);
    expect(changed.text).toContain('13:30');

    await panel.getByRole('button', { name: 'Cancel booking' }).click();
    const confirm = page.getByRole('alertdialog', { name: `Cancel booking ${booking.code}?` });
    await confirm.getByLabel('Reason (optional)').fill('Supplier postponed');
    await confirm.getByRole('button', { name: 'Cancel booking' }).click();
    await expect(confirm).toBeHidden();
    await expect(panel.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    await expect(panel.getByText('Reason: Supplier postponed')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Reschedule' })).toBeDisabled();
    const cancelled = await emailWithSubject(carrierAdmin, `Booking ${booking.code} cancelled`);
    expect(cancelled.text).toContain('Supplier postponed');
  });

  test('after check-in both buttons are disabled with a one-line reason', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    const booking = await staffBooking(request, w.A, site, { startsAt: at('11:00') });
    await checkIn(booking.id);

    await signInAs(context, w.A.users.dispatcher);
    await page.goto(
      `/t/${w.A.tenantId}/plan?site=${site.siteId}&date=${WORLD_DAY}&booking=${booking.id}`,
    );
    const panel = page.getByRole('complementary', { name: 'Booking detail' });
    await expect(panel.getByText('Checked in', { exact: true }).first()).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Reschedule' })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Cancel booking' })).toBeDisabled();
    await expect(
      panel.getByText(
        'Changes are locked after check-in. Yard actions continue on the gate and dock screens.',
      ),
    ).toBeVisible();

    await panel.getByRole('link', { name: 'Open booking' }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${w.A.tenantId}/bookings/${booking.id}$`));
    await expect(page.getByRole('button', { name: 'Reschedule' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cancel booking' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeEnabled();
  });
});
