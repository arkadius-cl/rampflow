import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { putOverride } from '../support/u3.ts';

test.describe('PL-04 Usage', () => {
  test('the tenant list shows usage against limits and flags a soft limit above 100 %', async ({
    page,
    context,
    request,
  }) => {
    // axe walks every tenant row of the database, and each e2e run adds tenants.
    test.slow();
    const w = await seedWorld(request);
    // The world books three times for tenant A this month.
    await putOverride(request, w, w.A.tenantId, 'booking.max_bookings_per_month', 2);
    await signInAs(context, w.platformAdmin);

    await page.goto('/platform/tenants');
    const row = page.getByTestId(`tenant-${w.A.tenantId}`);
    // GET /api/platform/tenants reads usage tenant by tenant, and every e2e run adds tenants.
    await expect(row).toBeVisible({ timeout: 30_000 });
    const cells = row.getByRole('cell');
    await expect(cells.nth(0)).toContainText('Tenant A');
    await expect(cells.nth(1)).toHaveText('Pro');
    await expect(cells.nth(2)).toContainText('2 / 5');
    await expect(cells.nth(2)).toContainText('40 %');
    await expect(cells.nth(2)).not.toContainText('exceeded');
    await expect(cells.nth(3)).toContainText('/ 60');
    await expect(cells.nth(4)).toContainText('/ 75');
    await expect(cells.nth(5)).toContainText('3 / 2');
    await expect(cells.nth(5)).toContainText('150 %, soft limit exceeded');
    await expect(
      row.getByRole('progressbar', { name: /Bookings this month: 150 percent/ }),
    ).toBeVisible();
    await expect(page.getByTestId(`tenant-${w.B.tenantId}`)).not.toContainText('exceeded');
    await expectAccessible(page);

    await row.getByRole('link', { name: /Tenant A/ }).click();
    await expect(page).toHaveURL(new RegExp(`/platform/tenants/${w.A.tenantId}$`));
  });
});
