import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import {
  DockStatus,
  EuCountry,
  TaxIdStatus,
  TaxIdType,
  TenantListParam,
  TenantListView,
} from '../../packages/shared/src/modules/core/values.ts';
import { HttpMethod } from '../../packages/shared/src/values/http.ts';
import { OrgKind, TenantRole } from '../../packages/shared/src/values/roles.ts';
import { seedWorld, signInAs, signInByApi } from '../support/auth.ts';
import { createInvitation, createOnboardingTenant, uniqueEmail } from '../support/db.ts';
import {
  addDock,
  createTenant,
  expectAccessibleInBothThemes,
  setTenantFacts,
  uniqueDigits,
} from '../support/u3.ts';
import { apiCall, newSiteBody } from '../support/u4.ts';

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Tenant areas' });
const tab = (page: Page, name: string) => tabs(page).getByRole('link', { name, exact: true });
const path = (page: Page) => new URL(page.url()).pathname;

test.describe('PL-06 Tenant hub', () => {
  test('the tabs are routes; Sites counts docks, Members lists members and invitations', async ({
    page,
    context,
    request,
  }) => {
    test.slow();
    const w = await seedWorld(request);
    const hub = `/platform/tenants/${w.A.tenantId}`;
    const site = w.A.sites[0]?.id as string;
    // Next to the world's two active docks: one in maintenance counts, an inactive one does not.
    await addDock(site, DockStatus.maintenance);
    await addDock(site, DockStatus.inactive);
    const gateInvite = uniqueEmail('gate');
    const adminInvite = uniqueEmail('second-admin');
    for (const [email, role] of [
      [gateInvite, TenantRole.gate_operator],
      [adminInvite, TenantRole.tenant_admin],
    ] as const) {
      await createInvitation({
        orgId: w.A.tenantId,
        orgKind: OrgKind.tenant,
        role,
        email,
        invitedBy: w.A.users.tenant_admin.id,
        siteIds: role === TenantRole.gate_operator ? [site] : [],
      });
    }
    await signInAs(context, w.platformAdmin);

    // A deep link to a tab, in a new browser tab.
    const deep = await context.newPage();
    await deep.goto(`${hub}/sites`);
    await expect(deep.getByRole('heading', { name: /^Tenant A/ })).toBeVisible();
    await expect(tab(deep, 'Sites')).toHaveAttribute('aria-current', 'page');
    await expect(tabs(deep).locator('[aria-current="page"]')).toHaveCount(1);
    const siteRow = deep.getByRole('row', { name: /^Site 1 / });
    await expect(siteRow.getByRole('cell')).toHaveText([
      'Site 1',
      'Hamburg',
      /^DE/,
      'Europe/Berlin',
      'Active',
      '1',
      '3',
      /\d{4}/,
    ]);
    await expectAccessibleInBothThemes(deep);
    await deep.close();

    // A tab change is a history entry.
    await page.goto(hub);
    await expect(tab(page, 'Overview')).toHaveAttribute('aria-current', 'page');
    await tab(page, 'Members').click();
    await expect.poll(() => path(page)).toBe(`${hub}/members`);
    await expect(tab(page, 'Members')).toHaveAttribute('aria-current', 'page');
    await expect(tab(page, 'Overview')).not.toHaveAttribute('aria-current');
    await page.goBack();
    await expect.poll(() => path(page)).toBe(hub);
    await expect(tab(page, 'Overview')).toHaveAttribute('aria-current', 'page');

    // A member and an invitation in one table.
    await tab(page, 'Members').click();
    const members = page.getByRole('table', { name: 'Members' });
    const dispatcher = members.getByRole('row').filter({ hasText: w.A.users.dispatcher.email });
    await expect(dispatcher).toContainText('Dispatcher');
    await expect(dispatcher).toContainText('Member');
    const invited = members.getByRole('row').filter({ hasText: gateInvite });
    await expect(invited).toContainText('Gate operator');
    await expect(invited).toContainText('Invited');
    await expect(invited).toContainText(/, expires \w/);
    await expectAccessibleInBothThemes(page);

    // The role filter is in the URL: admins and admin invitations only.
    await page.goto(`${hub}/members?${new URLSearchParams({ role: TenantRole.tenant_admin })}`);
    const emails = members.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(emails.filter({ hasText: adminInvite })).toContainText('Invited');
    await expect(emails.filter({ hasText: w.A.users.tenant_admin.email })).toHaveCount(1);
    await expect(emails.filter({ hasText: w.A.users.dispatcher.email })).toHaveCount(0);
    await expect(emails.filter({ hasText: gateInvite })).toHaveCount(0);
    for (const row of await emails.all()) await expect(row).toContainText('Tenant admin');

    // An unknown tenant: no access and no tab content.
    await page.goto(`/platform/tenants/${randomUUID()}/members`);
    await expect(page.getByText('No access')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(0);
  });

  test('the Overview names the open dock step and edits the master data in place', async ({
    page,
    context,
    browser,
    request,
  }) => {
    test.slow();
    const w = await seedWorld(request);
    const t = await createOnboardingTenant();
    // A site with a hall but no dock, as the tenant admin sets it up.
    const admin = await browser.newContext();
    await signInByApi(admin.request, t.users.tenant_admin);
    const site = await apiCall<{ id: string }>(
      admin,
      HttpMethod.POST,
      `/t/${t.tenantId}/sites`,
      newSiteBody('Bremerhaven'),
    );
    await apiCall(admin, HttpMethod.POST, `/t/${t.tenantId}/sites/${site.id}/halls`, {
      name: 'Halle 1',
    });
    await admin.close();
    await signInAs(context, w.platformAdmin);

    await page.goto(`/platform/tenants/${t.tenantId}`);
    const status = page.locator('[data-slot="card"]').filter({ hasText: /^Status/ });
    await expect(status).toContainText('Onboarding');
    const onboarding = page.locator('[data-slot="card"]').filter({ hasText: /^Onboarding/ });
    await expect(onboarding).toContainText('2 of 3 steps done');
    await expect(onboarding.getByRole('listitem').filter({ hasText: 'Add a dock' })).toHaveText(
      'Add a dockOpen',
    );
    await expect(onboarding.getByRole('listitem').filter({ hasText: 'Add a hall' })).toHaveText(
      'Add a hallDone',
    );
    await expectAccessibleInBothThemes(page);

    // "Edit" and "Cancel" send nothing and leave the card as it was.
    const card = page.locator('[data-slot="card"]').filter({ hasText: /^Master data/ });
    const writes: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/') && r.method() !== HttpMethod.GET) writes.push(r.url());
    });
    await card.getByRole('button', { name: 'Edit' }).click();
    await card.getByLabel('Country').selectOption(EuCountry.CZ);
    await expectAccessibleInBothThemes(page);
    await card.getByRole('button', { name: 'Cancel' }).click();
    await expect(card.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(card).toContainText('Not set');
    expect(writes).toEqual([]);

    // "Edit", a new name, "Save": a toast, the card in read mode and the header renamed.
    const renamed = `Renamed ${randomUUID().slice(0, 8)}`;
    await card.getByRole('button', { name: 'Edit' }).click();
    await card.getByLabel('Company name').fill(renamed);
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Tenant saved.')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(card).toContainText(renamed);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(renamed);
    expect(writes).toHaveLength(1);
  });

  test('"Show matching tenants" lists the tenants that share the tax id in view All', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const prefix = `PL06 ${randomUUID().slice(0, 8)}`;
    const taxId = {
      type: TaxIdType.eu_vat,
      value: `DE${uniqueDigits(9)}`,
      status: TaxIdStatus.verified,
    };
    const flagged = await createTenant(request, w, `${prefix} Flagged`);
    await setTenantFacts(flagged.id, { taxId, possibleDuplicate: true, activated: true });
    const twin = await createTenant(request, w, `${prefix} Twin`);
    await setTenantFacts(twin.id, { taxId, activated: true });
    const other = await createTenant(request, w, `${prefix} Other`);
    await setTenantFacts(other.id, {
      taxId: { ...taxId, value: `DE${uniqueDigits(9)}` },
      activated: true,
    });
    await signInAs(context, w.platformAdmin);

    await page.goto(`/platform/tenants/${flagged.id}`);
    await page.getByRole('link', { name: 'Show matching tenants' }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get(TenantListParam.view))
      .toBe(TenantListView.all);
    expect(new URL(page.url()).searchParams.get(TenantListParam.duplicateOf)).toBe(flagged.id);
    await expect(page.getByText(`Matching ${flagged.name}`)).toBeVisible();
    const rows = page
      .getByRole('table', { name: 'Tenants' })
      .getByRole('row')
      .filter({ has: page.getByRole('cell') });
    await expect
      .poll(() => rows.locator('td:first-child a').allTextContents())
      .toEqual([flagged.name, twin.name]);
  });
});
