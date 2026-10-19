import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { uniqueEmail } from '../support/db.ts';
import { latestEmailTo, linkIn } from '../support/mailpit.ts';
import { linkStatus, switchOff } from '../support/u7.ts';

test.describe('TN-03 Invite carriers', () => {
  test('the dispatcher invites a carrier by company name and email; the email arrives with notify.email off', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await switchOff(w.A.tenantId, 'notify.email', w.platformAdmin.id);
    await signInAs(context, w.A.users.dispatcher);

    await page.goto(`/t/${w.A.tenantId}/carriers`);
    await expect(page.getByRole('heading', { name: 'Carriers' })).toBeVisible();
    await expect(page.getByRole('cell', { name: /^Carrier A / })).toBeVisible();
    await expectAccessible(page);

    const email = uniqueEmail('baltic');
    await page.getByRole('button', { name: 'Invite carrier' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Company name').fill('Baltic Freight UAB');
    await dialog.getByLabel('Email', { exact: true }).fill(email);
    await expectAccessible(page);
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();
    await expect(page.getByRole('cell', { name: email })).toBeVisible();

    const mail = await latestEmailTo(email);
    expect(mail.subject).toMatch(/invites Baltic Freight UAB to book slots on rampflow$/);
    expect(linkIn(mail.text, '/carrier-invite#')).toBeTruthy();
  });

  test('a deactivated carrier can no longer book; reactivating lifts it', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/carriers`);

    const row = page.getByRole('row', { name: /^Carrier A / });
    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'Existing bookings stay visible to both sides.',
    );
    await page.getByRole('alertdialog').getByRole('button', { name: 'Deactivate' }).click();
    await expect(row.getByText('Deactivated')).toBeVisible();
    expect(await linkStatus(w.A.tenantId, w.A.carrierId)).toBe('deactivated');

    const carrier = await context.browser()?.newContext();
    if (!carrier) throw new Error('no browser');
    await signInAs(carrier, w.A.users.carrier_user);
    const tab = await carrier.newPage();
    await tab.goto(`/c/${w.A.carrierId}/tenants`);
    await expect(
      tab.getByRole('row', { name: /^Tenant A / }).getByText('Paused by the warehouse'),
    ).toBeVisible();
    await carrier.close();

    await row.getByRole('button', { name: 'Activate' }).click();
    await expect(row.getByText('Active', { exact: true })).toBeVisible();
    expect(await linkStatus(w.A.tenantId, w.A.carrierId)).toBe('active');
  });
});
