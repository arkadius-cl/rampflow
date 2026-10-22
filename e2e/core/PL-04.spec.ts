import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  type TenantDetail,
  TenantListQuery,
} from '../../packages/shared/src/modules/core/api.platform.ts';
import {
  EuCountry,
  TaxIdStatus,
  TaxIdType,
  TenantCountryFacet,
  TenantFlag,
  TenantListParam,
  TenantListView,
  TenantSortKey,
  TenantStatus,
} from '../../packages/shared/src/modules/core/values.ts';
import { SortOrder } from '../../packages/shared/src/values/list.ts';
import { PackageId } from '../../packages/shared/src/values/packages.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { activateTenant, uniqueEmail } from '../support/db.ts';
import {
  asPlatformAdmin,
  createTenant,
  expectAccessibleInBothThemes,
  putOverride,
  setTenantFacts,
  suspendTenant,
  uniqueDigits,
} from '../support/u3.ts';

const PACKAGES = [PackageId.start, PackageId.pro, PackageId.enterprise] as const;

/** Presses Tab until `target` has the focus. */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 80; i++) {
    const focused = await expect(target)
      .toBeFocused({ timeout: 100 })
      .then(() => true)
      .catch(() => false);
    if (focused) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/** The tenant list's facet parameters, in declaration order. */
const [STATUS_FACET = '', FACET = '', COUNTRY_FACET = '', FLAG_FACET = ''] = Object.keys(
  TenantListQuery.spec.facets,
);
const ALL = { [TenantListParam.view]: TenantListView.all };

const search = (page: Page) => new URL(page.url()).searchParams;

/** A facet's trigger in the toolbar, not the sortable column header of the same name. */
const facetButton = (page: Page, title: string) =>
  page
    .getByRole('button', { name: new RegExp(`^${title}`) })
    .and(page.locator('[data-slot="popover-trigger"]'));

test.describe('PL-04 Usage', () => {
  test('the tenant list searches, filters, sorts and pages in the URL and shows usage against limits', async ({
    page,
    context,
    request,
  }) => {
    test.slow();
    const w = await seedWorld(request);
    // The world books three times for tenant A this month.
    await putOverride(request, w, w.A.tenantId, 'booking.max_bookings_per_month', 2);
    const prefix = `PL04 ${randomUUID().slice(0, 8)}`;
    // 12 tenants created in name order; `${prefix} 02`, 05, 08 and 11 are Pro, the odd ones
    // are active and the even ones still onboarding.
    for (let i = 1; i <= 12; i++) {
      const res = await request.post('/api/platform/tenants', {
        headers: asPlatformAdmin(w),
        data: {
          name: `${prefix} ${String(i).padStart(2, '0')}`,
          package: PACKAGES[(i - 1) % 3],
          adminEmail: uniqueEmail('pl04'),
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      if (i % 2 === 1) await activateTenant(((await res.json()) as TenantDetail).id);
    }
    const tenantA = (await (
      await request.get(`/api/platform/tenants/${w.A.tenantId}`, { headers: asPlatformAdmin(w) })
    ).json()) as TenantDetail;
    await signInAs(context, w.platformAdmin);

    const table = page.getByRole('table', { name: 'Tenants' });
    const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
    const searchbox = page.getByRole('searchbox', { name: 'Search' });
    const packageFilter = facetButton(page, 'Package');
    const statusFilter = facetButton(page, 'Status');
    const range = (text: string) => page.getByText(text, { exact: true });

    // Usage meters of one tenant, found by its name; active without a flag, so only in "All".
    await page.goto(`/platform/tenants?${new URLSearchParams({ ...ALL, q: tenantA.name })}`);
    const row = page.getByTestId(`tenant-${w.A.tenantId}`);
    const cells = row.getByRole('cell');
    await expect(cells.nth(0)).toContainText('Tenant A');
    await expect(cells.nth(0).getByRole('link', { name: tenantA.name })).toBeVisible();
    // The world's tenants have docks, so they are active (ON-02).
    await expect(cells.nth(1)).toHaveText('Active');
    await expect(cells.nth(2)).toHaveText('Pro');
    await expect(cells.nth(5)).toContainText(w.A.users.tenant_admin.email);
    // The short date of the list (ADR-0022); the hub shows the full instant with the zone.
    await expect(cells.nth(7)).toContainText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    await expect(cells.nth(8)).toContainText('2 / 5');
    await expect(cells.nth(8)).toContainText('40 %');
    await expect(cells.nth(8)).not.toContainText('exceeded');
    await expect(cells.nth(9)).toContainText('/ 60');
    await expect(cells.nth(10)).toContainText('/ 75');
    await expect(cells.nth(11)).toContainText('3 / 2');
    await expect(cells.nth(11)).toContainText('150 %, soft limit exceeded');
    await expect(
      row.getByRole('progressbar', { name: /Bookings this month: 150 percent/ }),
    ).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Sites' })).not.toHaveAttribute(
      'aria-sort',
    );
    for (const name of ['Sites', 'Tax id', 'Admin email']) {
      const header = table.getByRole('columnheader', { name, exact: true });
      await expect(header).not.toHaveAttribute('aria-sort');
      await expect(header.getByRole('button')).toHaveCount(0);
    }

    // A typing run is one history entry: one back press undoes the whole search.
    await page.goto(`/platform/tenants?${new URLSearchParams(ALL)}`);
    await expect(table.getByRole('columnheader', { name: /Tenant/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await searchbox.pressSequentially(prefix, { delay: 60 });
    await expect.poll(() => search(page).get('q')).toBe(prefix);
    await expect(range('1–12 of 12')).toBeVisible();
    await expect(page.locator('[aria-live="polite"]', { hasText: '1–12 of 12' })).toBeVisible();
    await expectAccessible(page);
    await page.goBack();
    await expect(searchbox).toHaveValue('');
    await expect.poll(() => search(page).has('q')).toBe(false);

    // A facet selection is a history entry; the trigger names the selection.
    await page.goto(`/platform/tenants?${new URLSearchParams({ ...ALL, q: prefix })}`);
    await expect(range('1–12 of 12')).toBeVisible();
    await packageFilter.click();
    const pro = page.getByRole('option', { name: /^Pro/ });
    await expect(pro).toContainText('4');
    await expectAccessible(page);
    await pro.click();
    await page.keyboard.press('Escape');
    await expect.poll(() => search(page).get(FACET)).toBe(PackageId.pro);
    await expect(packageFilter).toContainText('Pro');
    await expect(range('1–4 of 4')).toBeVisible();
    await expect(rows).toHaveCount(4);
    for (const cell of await rows.locator('td:nth-child(3)').all())
      await expect(cell).toHaveText('Pro');
    await page.goBack();
    await expect.poll(() => search(page).has(FACET)).toBe(false);
    await expect(range('1–12 of 12')).toBeVisible();

    // The status filter: only tenants without an activation time, status as text in each row.
    await statusFilter.click();
    const onboarding = page.getByRole('option', { name: /^Onboarding/ });
    await expect(onboarding).toContainText('6');
    await expect(page.getByRole('option', { name: /^Active/ })).toContainText('6');
    await onboarding.click();
    await page.keyboard.press('Escape');
    await expect.poll(() => search(page).get(STATUS_FACET)).toBe(TenantStatus.onboarding);
    await expect(range('1–6 of 6')).toBeVisible();
    for (const cell of await rows.locator('td:nth-child(2)').all())
      await expect(cell).toHaveText('Onboarding');
    await expect(rows.first()).toContainText(`${prefix} 02`);
    await page.goBack();
    await expect.poll(() => search(page).has(STATUS_FACET)).toBe(false);
    await expect(range('1–12 of 12')).toBeVisible();

    // Created, newest first.
    const created = table.getByRole('button', { name: /^Created/ });
    await created.click();
    await created.click();
    await expect.poll(() => search(page).get('order')).toBe(SortOrder.desc);
    expect(search(page).get('sort')).toBe(TenantSortKey.createdAt);
    await expect(table.getByRole('columnheader', { name: /Created/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await expect(rows.first()).toContainText(`${prefix} 12`);

    // 10 rows per page, then page 2.
    await page.getByRole('combobox', { name: 'Rows per page' }).click();
    await page.getByRole('option', { name: '10', exact: true }).click();
    await expect(range('1–10 of 12')).toBeVisible();
    const firstPage = await rows.locator('td:first-child').allTextContents();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(range('11–12 of 12')).toBeVisible();
    const secondPage = await rows.locator('td:first-child').allTextContents();
    expect(secondPage).toHaveLength(2);
    expect(new Set([...firstPage, ...secondPage]).size).toBe(12);
    expect(search(page).get('page')).toBe('2');

    // The URL is the state: another page opens the same list.
    const copied = page.url();
    const other = await context.newPage();
    await other.goto(copied);
    await expect(other.getByText('11–12 of 12', { exact: true })).toBeVisible();
    expect(
      await other
        .getByRole('table', { name: 'Tenants' })
        .getByRole('row')
        .filter({ has: other.getByRole('cell') })
        .locator('td:first-child')
        .allTextContents(),
    ).toEqual(secondPage);
    await other.close();

    // An outdated link falls back: the unknown package drops, the page size goes back to 25.
    await page.goto(
      `/platform/tenants?${new URLSearchParams({ ...ALL, q: prefix, [FACET]: 'gold,pro', pageSize: '7' })}`,
    );
    await expect(packageFilter).toContainText('Pro');
    await expect(page.getByRole('combobox', { name: 'Rows per page' })).toHaveText(/25/);
    await expect(range('1–4 of 4')).toBeVisible();
    await expect.poll(() => search(page).get(FACET)).toBe(PackageId.pro);
    expect(search(page).has('pageSize')).toBe(false);

    // No match, then "Clear filters" returns to the default view with a clean URL.
    await searchbox.fill('zzzz');
    await expect(table.getByText('No tenants match')).toBeVisible();
    await expect(table).toContainText('Search: “zzzz”');
    await expectAccessible(page);
    await table.getByRole('button', { name: 'Clear filters' }).click();
    await expect.poll(() => page.url()).toMatch(/\/platform\/tenants$/);
    await expect(searchbox).toHaveValue('');
    await expect(rows.first()).toBeVisible();

    // Keyboard only: search, filter, a sortable header and the paging controls.
    await page.goto(`/platform/tenants?${new URLSearchParams({ ...ALL, q: prefix })}`);
    await expect(range('1–12 of 12')).toBeVisible();
    await tabTo(page, searchbox);
    await tabTo(page, packageFilter);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('option', { name: /^Start/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect.poll(() => search(page).get(FACET)).toBe(PackageId.start);
    await page.keyboard.press('Escape');
    const tenantHeader = table.getByRole('button', { name: /^Tenant/ });
    await tabTo(page, tenantHeader);
    await page.keyboard.press('Enter');
    await expect(table.getByRole('columnheader', { name: /Tenant/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    const pageSize = page.getByRole('combobox', { name: 'Rows per page' });
    await tabTo(page, pageSize);
    await page.keyboard.press('Enter');
    await page.getByRole('option', { name: '10', exact: true }).press('Enter');
    await expect.poll(() => search(page).get('pageSize')).toBe('10');
    await page.goto(
      `/platform/tenants?${new URLSearchParams({ ...ALL, q: prefix, pageSize: '10' })}`,
    );
    const next = page.getByRole('button', { name: 'Next page' });
    await tabTo(page, next);
    await page.keyboard.press('Enter');
    await expect(range('11–12 of 12')).toBeVisible();

    await rows.first().getByRole('link').click();
    await expect(page).toHaveURL(/\/platform\/tenants\/[0-9a-f-]+$/);

    // An unknown tenant id shows "no access" inside the shell.
    await page.goto(`/platform/tenants/${randomUUID()}`);
    await expect(page.getByText('No access')).toBeVisible();
    await expect(
      page.locator('[data-slot="sidebar-content"]').getByRole('link', { name: 'Tenants' }),
    ).toBeVisible();
  });

  test('the views, the status, country and flag facets, last activity and the row actions', async ({
    page,
    context,
    request,
  }) => {
    test.slow();
    const w = await seedWorld(request);
    const prefix = `Q7 ${randomUUID().slice(0, 8)}`;
    const digits = uniqueDigits(9);
    const DAY = 24 * 60 * 60 * 1000;
    // One tenant per status and flag; only "Active" needs no attention.
    const active = await createTenant(request, w, `${prefix} Active`);
    await setTenantFacts(active.id, {
      activated: true,
      country: EuCountry.AT,
      lastSeenAt: new Date(Date.now() - 40 * DAY),
    });
    const duplicate = await createTenant(request, w, `${prefix} Duplicate`);
    await setTenantFacts(duplicate.id, {
      activated: true,
      country: EuCountry.DE,
      possibleDuplicate: true,
      lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const unverified = await createTenant(request, w, `${prefix} Unverified`);
    await setTenantFacts(unverified.id, {
      activated: true,
      country: EuCountry.DE,
      taxId: { type: TaxIdType.eu_vat, value: `DE${digits}`, status: TaxIdStatus.unverified },
    });
    const onboarding = await createTenant(request, w, `${prefix} Onboarding`);
    const suspended = await createTenant(request, w, `${prefix} Suspended`);
    await setTenantFacts(suspended.id, { activated: true, country: EuCountry.PL });
    await suspendTenant(request, w, suspended.id, 'Unpaid since March');
    await signInAs(context, w.platformAdmin);

    const table = page.getByRole('table', { name: 'Tenants' });
    const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
    const names = () => rows.locator('td:first-child a').allTextContents();
    const tab = (name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
    const row = (t: { id: string }) => page.getByTestId(`tenant-${t.id}`);

    // The default view: four need attention, five in all, no `view` in the URL.
    await page.goto(`/platform/tenants?${new URLSearchParams({ q: prefix })}`);
    await expect(tab('Needs attention')).toHaveAttribute('aria-selected', 'true');
    await expect(tab('Needs attention')).toHaveText('Needs attention4');
    await expect(tab('All')).toHaveText('All5');
    await expect(rows).toHaveCount(4);
    await expect(row(active)).toHaveCount(0);
    expect(search(page).has(TenantListParam.view)).toBe(false);
    await tab('All').click();
    await expect.poll(() => search(page).get(TenantListParam.view)).toBe(TenantListView.all);
    expect(search(page).get('q')).toBe(prefix);
    await expect(tab('All')).toHaveAttribute('aria-selected', 'true');
    await expect(rows).toHaveCount(5);
    await page.goBack();
    await expect(tab('Needs attention')).toHaveAttribute('aria-selected', 'true');
    await expect(rows).toHaveCount(4);
    expect(search(page).has(TenantListParam.view)).toBe(false);

    // The counts follow the search: the unflagged active tenant needs no attention.
    await page.goto(`/platform/tenants?${new URLSearchParams({ q: `${prefix} Active` })}`);
    await expect(tab('Needs attention')).toHaveText('Needs attention0');
    await expect(tab('All')).toHaveText('All1');
    await expect(table.getByText('No tenants match')).toBeVisible();

    // Each status cell names its status in text.
    await page.goto(`/platform/tenants?${new URLSearchParams({ ...ALL, q: prefix })}`);
    await expect(rows).toHaveCount(5);
    await expect(row(active).getByRole('cell').nth(1)).toHaveText('Active');
    await expect(row(onboarding).getByRole('cell').nth(1)).toHaveText('Onboarding');
    await expect(row(suspended).getByRole('cell').nth(1)).toHaveText('Suspended');
    await expect(row(unverified).getByRole('cell').nth(4)).toHaveText(`DE${digits}Unverified`);
    await expect(row(duplicate).getByRole('cell').nth(0)).toContainText('Possible duplicate');
    await expect(row(onboarding).getByRole('cell').nth(3)).toHaveText('Not set');
    await expect(row(onboarding).getByRole('cell').nth(5)).toContainText('Invited');

    // Two statuses.
    const statusFilter = facetButton(page, 'Status');
    await statusFilter.click();
    await page.getByRole('option', { name: /^Onboarding/ }).click();
    await page.getByRole('option', { name: /^Suspended/ }).click();
    await page.keyboard.press('Escape');
    await expect
      .poll(() => search(page).get(STATUS_FACET))
      .toBe(`${TenantStatus.onboarding},${TenantStatus.suspended}`);
    await expect.poll(names).toEqual([`${prefix} Onboarding`, `${prefix} Suspended`]);
    await page.goto(`/platform/tenants?${new URLSearchParams({ ...ALL, q: prefix })}`);
    await expect(rows).toHaveCount(5);

    // Tenants without a country, with the Country filter open in both themes.
    const countryFilter = facetButton(page, 'Country');
    await countryFilter.click();
    const notSet = page.getByRole('option', { name: /^Not set/ });
    await expect(notSet).toContainText('1');
    await expectAccessibleInBothThemes(page);
    await notSet.click();
    await page.keyboard.press('Escape');
    await expect.poll(() => search(page).get(COUNTRY_FACET)).toBe(TenantCountryFacet.none);
    await expect.poll(names).toEqual([`${prefix} Onboarding`]);
    await page.goBack();
    await expect(rows).toHaveCount(5);

    // The flag "Tax id unverified".
    await facetButton(page, 'Flags').click();
    await page.getByRole('option', { name: /^Tax id unverified/ }).click();
    await page.keyboard.press('Escape');
    await expect.poll(() => search(page).get(FLAG_FACET)).toBe(TenantFlag.tax_id_unverified);
    await expect.poll(names).toEqual([`${prefix} Unverified`]);

    // The tax id with spaces and in lower case.
    const spaced = `de ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    await page.goto(`/platform/tenants?${new URLSearchParams({ ...ALL, q: spaced })}`);
    await expect.poll(names).toEqual([`${prefix} Unverified`]);

    // Dormant tenants first, those never active last.
    await page.goto(`/platform/tenants?${new URLSearchParams({ ...ALL, q: prefix })}`);
    await table.getByRole('button', { name: /^Last activity/ }).click();
    await expect.poll(() => search(page).get('sort')).toBe(TenantSortKey.lastActivityAt);
    // Ascending is the default order, so the canonical URL leaves `order` out.
    expect(search(page).get('order') ?? SortOrder.asc).toBe(SortOrder.asc);
    expect(search(page).get(TenantListParam.view)).toBe(TenantListView.all);
    await expect(table.getByRole('columnheader', { name: /Last activity/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await expect
      .poll(async () => (await names()).slice(0, 2))
      .toEqual([`${prefix} Active`, `${prefix} Duplicate`]);
    const order = await names();
    expect(new Set(order.slice(2))).toEqual(
      new Set([`${prefix} Onboarding`, `${prefix} Suspended`, `${prefix} Unverified`]),
    );
    expect(await rows.locator('td:nth-child(7)').allTextContents()).toEqual([
      expect.not.stringMatching(/^Never$/),
      expect.not.stringMatching(/^Never$/),
      'Never',
      'Never',
      'Never',
    ]);

    // The row actions of an active and of a suspended tenant.
    const menuOf = (t: { name: string }) =>
      page.getByRole('button', { name: `Actions for ${t.name}` });
    const menu = page.getByRole('menu');
    await menuOf(suspended).click();
    await expect(menu.getByRole('menuitem')).toHaveText(['View', 'Reactivate']);
    await page.keyboard.press('Escape');
    await menuOf(active).click();
    await expect(menu.getByRole('menuitem')).toHaveText(['View', 'Suspend']);
    // Opening the menu stays on the list.
    await expect(page).toHaveURL(/\/platform\/tenants\?/);
    await expectAccessibleInBothThemes(page);

    // "Suspend" from the menu: the sheet over the list, then the row reads "Suspended".
    await menu.getByRole('menuitem', { name: 'Suspend' }).click();
    const sheet = page.getByRole('dialog', { name: `Suspend ${active.name}` });
    await expect(sheet).toBeVisible();
    // Behind the modal sheet the list is inert, so it is found by test id, not by role.
    await expect(row(active)).toBeVisible();
    await sheet.getByLabel('Reason').fill('Fake bookings reported by carriers');
    await sheet.getByRole('button', { name: 'Suspend tenant' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText(`${active.name} suspended.`)).toBeVisible();
    await expect(row(active).getByRole('cell').nth(1)).toHaveText('Suspended');

    // A click on the Package cell opens the hub.
    await row(duplicate).getByRole('cell').nth(2).click();
    await expect(page).toHaveURL(new RegExp(`/platform/tenants/${duplicate.id}$`));
  });
});
