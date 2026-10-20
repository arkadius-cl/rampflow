import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  type TenantDetail,
  TenantListQuery,
} from '../../packages/shared/src/modules/core/api.platform.ts';
import { TenantSortKey, TenantStatus } from '../../packages/shared/src/modules/core/values.ts';
import { SortOrder } from '../../packages/shared/src/values/list.ts';
import { PackageId } from '../../packages/shared/src/values/packages.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { activateTenant, uniqueEmail } from '../support/db.ts';
import { asPlatformAdmin, putOverride } from '../support/u3.ts';

const PACKAGES = [PackageId.start, PackageId.pro, PackageId.enterprise] as const;

/** Presses Tab until `target` has the focus. */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i++) {
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
const [FACET = '', STATUS_FACET = ''] = Object.keys(TenantListQuery.spec.facets);

const search = (page: Page) => new URL(page.url()).searchParams;

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
    const packageFilter = page.getByRole('button', { name: /^Package/ });
    const statusFilter = page.getByRole('button', { name: /^Status/ });
    const range = (text: string) => page.getByText(text, { exact: true });

    // Usage meters of one tenant, found by its name.
    await page.goto(`/platform/tenants?${new URLSearchParams({ q: tenantA.name })}`);
    const row = page.getByTestId(`tenant-${w.A.tenantId}`);
    const cells = row.getByRole('cell');
    await expect(cells.nth(0)).toContainText('Tenant A');
    await expect(cells.nth(1)).toHaveText('Pro');
    await expect(cells.nth(2)).toHaveText('Onboarding');
    await expect(cells.nth(3)).toContainText(/\d{4}, \d{2}:\d{2} \S+/);
    await expect(cells.nth(4)).toContainText('2 / 5');
    await expect(cells.nth(4)).toContainText('40 %');
    await expect(cells.nth(4)).not.toContainText('exceeded');
    await expect(cells.nth(5)).toContainText('/ 60');
    await expect(cells.nth(6)).toContainText('/ 75');
    await expect(cells.nth(7)).toContainText('3 / 2');
    await expect(cells.nth(7)).toContainText('150 %, soft limit exceeded');
    await expect(
      row.getByRole('progressbar', { name: /Bookings this month: 150 percent/ }),
    ).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Sites' })).not.toHaveAttribute(
      'aria-sort',
    );
    await expect(
      table.getByRole('columnheader', { name: 'Sites' }).getByRole('button'),
    ).toHaveCount(0);

    // A typing run is one history entry: one back press undoes the whole search.
    await page.goto('/platform/tenants');
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
    await page.goto(`/platform/tenants?${new URLSearchParams({ q: prefix })}`);
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
    for (const cell of await rows.locator('td:nth-child(2)').all())
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
    for (const cell of await rows.locator('td:nth-child(3)').all())
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
      `/platform/tenants?${new URLSearchParams({ q: prefix, package: 'gold,pro', pageSize: '7' })}`,
    );
    await expect(packageFilter).toContainText('Pro');
    await expect(page.getByRole('combobox', { name: 'Rows per page' })).toHaveText(/25/);
    await expect(range('1–4 of 4')).toBeVisible();
    await expect.poll(() => search(page).get(FACET)).toBe(PackageId.pro);
    expect(search(page).has('pageSize')).toBe(false);

    // No match, then "Clear filters" shows every tenant with a clean URL.
    await searchbox.fill('zzzz');
    await expect(table.getByText('No tenants match')).toBeVisible();
    await expect(table).toContainText('Search: “zzzz”');
    await expectAccessible(page);
    await table.getByRole('button', { name: 'Clear filters' }).click();
    await expect.poll(() => page.url()).toMatch(/\/platform\/tenants$/);
    await expect(searchbox).toHaveValue('');
    await expect(rows.first()).toBeVisible();

    // Keyboard only: search, filter, a sortable header and the paging controls.
    await page.goto(`/platform/tenants?${new URLSearchParams({ q: prefix })}`);
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
    await page.goto(`/platform/tenants?${new URLSearchParams({ q: prefix, pageSize: '10' })}`);
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
});
