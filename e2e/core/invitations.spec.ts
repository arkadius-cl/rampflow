import { expect, test } from '@playwright/test';
import { OrgKind, Role } from '../../packages/shared/src/values/roles.ts';
import { expectAccessible, seedWorld } from '../support/auth.ts';
import { createAccount, createInvitation, sitesOfMember, uniqueEmail } from '../support/db.ts';

test.describe('Invitations (PL-01, TN-01, CR-04 acceptance)', () => {
  test('a new gate operator accepts from /invite#<token>; the token never reaches a request URL', async ({
    page,
    request,
  }) => {
    const w = await seedWorld(request);
    const email = uniqueEmail('gate');
    const token = await createInvitation({
      orgId: w.A.tenantId,
      orgKind: OrgKind.tenant,
      role: Role.gate_operator,
      email,
      invitedBy: w.A.users.tenant_admin.id,
      siteIds: [w.A.sites[1]?.id as string],
    });
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));

    await page.goto(`/invite#${token}`);
    await expect(page.getByText(/You are invited to Tenant A .* as Gate operator\./)).toBeVisible();
    await expect(page).toHaveURL(/\/invite$/);
    await expectAccessible(page);

    await page.getByLabel('Your name').fill('Gina Gate');
    await page.getByLabel('New password').fill('gate password 2026');
    await page.getByLabel('Repeat the password').fill('gate password 2026');
    await page.getByRole('button', { name: 'Create account and accept' }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${w.A.tenantId}`));
    await expect(page.getByTestId('org-switcher')).toContainText('Tenant A');

    expect(await sitesOfMember(email)).toEqual([w.A.sites[1]?.id]);
    expect(urls.filter((u) => u.includes(token))).toEqual([]);

    await page.goto(`/invite#${token}`);
    await expect(page.getByText('This invitation no longer works')).toBeVisible();
  });

  test('an existing carrier user signs in on the invitation page and accepts', async ({
    page,
    request,
  }) => {
    const w = await seedWorld(request);
    const person = await createAccount(uniqueEmail('colleague'), 'colleague password');
    const token = await createInvitation({
      orgId: w.A.carrierId,
      orgKind: OrgKind.carrier,
      role: Role.carrier_user,
      email: person.email,
      invitedBy: w.A.users.carrier_admin.id,
    });

    await page.goto(`/invite#${token}`);
    await expect(
      page.getByText('This email already has an account. Sign in to accept.'),
    ).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(person.password);
    await page.getByRole('button', { name: 'Sign in and accept' }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${w.A.carrierId}`));
  });
});
