import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { uniqueEmail } from '../support/db.ts';
import { acceptEmailedInvitation } from '../support/u3.ts';

test.describe('PL-01 Create a tenant', () => {
  test('the platform admin creates a tenant; the invited admin joins it as tenant admin', async ({
    page,
    context,
    request,
    browser,
  }) => {
    // Waits for the outbox (5 s ticks) and lists every tenant of the database.
    test.slow();
    const w = await seedWorld(request);
    await signInAs(context, w.platformAdmin);
    const name = `Acme ${Date.now().toString(36)}`;
    const adminEmail = uniqueEmail('acme-admin');

    await page.goto('/platform/tenants');
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
    await expect(page.getByTestId(`tenant-${w.A.tenantId}`)).toBeVisible({ timeout: 30_000 });
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Create tenant' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Company name').fill(name);
    await dialog.getByLabel('Package').selectOption('pro');
    await dialog.getByLabel('Admin email').fill(adminEmail);
    await dialog.getByRole('button', { name: 'Create and invite' }).click();

    await expect(page.getByRole('heading', { name })).toBeVisible();
    const tenantId = /\/platform\/tenants\/([0-9a-f-]+)$/.exec(page.url())?.[1] as string;
    await expect(page.getByTestId('entitlement-core.max_sites')).toContainText('5');
    await expect(page.getByTestId('entitlement-safety.quiz')).toContainText('On');
    await expect(page.getByText(adminEmail)).toBeVisible();

    const joined = await acceptEmailedInvitation(browser, adminEmail, 'Ada Acme');
    await expect(joined).toHaveURL(new RegExp(`/t/${tenantId}`));
    await expect(joined.getByTestId('org-switcher')).toContainText(name);
    await expect(
      joined.locator('[data-slot="sidebar-content"]').getByRole('link', { name: 'Staff' }),
    ).toBeVisible();

    await joined.goto('/');
    await expect(joined).toHaveURL(new RegExp(`/t/${tenantId}`));
    await joined.getByTestId('org-switcher').click();
    await expect(joined.getByRole('menuitem')).toHaveCount(1);
    await joined.context().close();
  });
});
