import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { uniqueEmail } from '../support/db.ts';
import { acceptEmailedInvitation } from '../support/u3.ts';

test.describe('CR-04 Carrier users', () => {
  test('a carrier admin invites a colleague, who joins the carrier', async ({
    page,
    context,
    request,
    browser,
  }) => {
    // Waits for the outbox, which sends every 5 seconds.
    test.slow();
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.carrier_admin);
    const email = uniqueEmail('colleague');

    await page.goto(`/c/${w.A.carrierId}/users`);
    await expect(page.getByRole('heading', { name: 'Colleagues' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Sites' })).toHaveCount(0);
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Invite' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByLabel('Role').selectOption('carrier_user');
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByRole('row', { name: new RegExp(email) })).toContainText('Carrier user');

    const joined = await acceptEmailedInvitation(browser, email, 'Cora Colleague');
    await expect(joined).toHaveURL(new RegExp(`/c/${w.A.carrierId}`));
    await expect(joined.getByTestId('org-switcher')).toContainText('Carrier A');
    await joined.context().close();

    await page.reload();
    const colleague = page.getByRole('row', { name: /Cora Colleague/ });
    await colleague.getByRole('button', { name: /^Edit/ }).click();
    await page.getByRole('dialog').getByLabel('Role').selectOption('carrier_admin');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(colleague).toContainText('Carrier admin');
  });

  test('a carrier user cannot manage colleagues', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.carrier_user);
    await page.goto(`/c/${w.A.carrierId}/users`);
    await expect(page.getByText('No access')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Colleagues' })).toHaveCount(0);
  });
});
