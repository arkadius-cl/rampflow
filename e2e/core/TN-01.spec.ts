import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { sitesOfMember, uniqueEmail } from '../support/db.ts';
import { acceptEmailedInvitation, putOverride } from '../support/u3.ts';

test.describe('TN-01 Staff', () => {
  test('the admin invites a gate operator for one site; the invitee joins with that site', async ({
    page,
    context,
    request,
    browser,
  }) => {
    // Waits for the outbox, which sends every 5 seconds.
    test.slow();
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    const email = uniqueEmail('gate');

    await page.goto(`/t/${w.A.tenantId}/staff`);
    await expect(page.getByRole('heading', { name: 'Staff', exact: true })).toBeVisible();
    const self = page.getByRole('row', { name: new RegExp(w.A.users.tenant_admin.email) });
    await expect(self).toContainText('You');
    await expect(self.getByRole('button')).toHaveCount(0);
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Invite' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByLabel('Role').selectOption('dispatcher');
    await expect(dialog.getByText('Sites', { exact: true })).toHaveCount(0);
    await dialog.getByLabel('Role').selectOption('gate_operator');
    await dialog.getByRole('checkbox', { name: 'Site 2' }).check();
    await expectAccessible(page);
    await dialog.getByRole('button', { name: 'Send invitation' }).click();

    const invitation = page.getByRole('row', { name: new RegExp(email) });
    await expect(invitation).toContainText('Gate operator');
    await expect(invitation).toContainText('Site 2');
    await expect(invitation).not.toContainText('Site 1');

    const joined = await acceptEmailedInvitation(browser, email, 'Gina Gate');
    await expect(joined).toHaveURL(new RegExp(`/t/${w.A.tenantId}`));
    expect(await sitesOfMember(email)).toEqual([w.A.sites[1]?.id]);
    await joined.context().close();

    await page.reload();
    const member = page.getByRole('row', { name: /Gina Gate/ });
    await expect(member).toContainText('Gate operator');
    await expect(member).toContainText('Site 2');
    await expect(page.getByRole('row', { name: new RegExp(email) })).toHaveCount(1);
  });

  test('the admin changes a role, removes a member and revokes an invitation', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    const dock = w.A.users.dock_operator;
    const gone = w.A.users.gate_operator_other_site;

    await page.goto(`/t/${w.A.tenantId}/staff`);
    const dockRow = page.getByRole('row', { name: new RegExp(dock.email) });
    await dockRow.getByRole('button', { name: /^Edit/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Role').selectOption('dispatcher');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dockRow).toContainText('Dispatcher');

    const goneRow = page.getByRole('row', { name: new RegExp(gone.email) });
    await goneRow.getByRole('button', { name: /^Remove/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(goneRow).toHaveCount(0);

    const email = uniqueEmail('later');
    await page.getByRole('button', { name: 'Invite' }).click();
    await page.getByRole('dialog').getByLabel('Email').fill(email);
    await page.getByRole('dialog').getByRole('button', { name: 'Send invitation' }).click();
    await page.getByRole('button', { name: `Revoke the invitation for ${email}` }).click();
    await expect(page.getByRole('row', { name: new RegExp(email) })).toHaveCount(0);
  });

  test('an invite at the user limit shows that the package limit is reached', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await putOverride(request, w, w.A.tenantId, 'core.max_internal_users', 1);
    await signInAs(context, w.A.users.tenant_admin);

    await page.goto(`/t/${w.A.tenantId}/staff`);
    await page.getByRole('button', { name: 'Invite' }).click();
    await page.getByRole('dialog').getByLabel('Email').fill(uniqueEmail('one-too-many'));
    await page.getByRole('dialog').getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('Your package limit is reached.')).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
