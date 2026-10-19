import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';

test.describe('MD-02 Halls and docks', () => {
  test('a tenant admin adds a hall and a dock, and dock codes stay unique per site', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/sites/${w.A.sites[0]?.id}`);
    await expect(page.getByText('Hall 1', { exact: true })).toBeVisible();
    await expect(page.getByText('4 of 60')).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'New hall' }).click();
    await page.getByRole('dialog').getByLabel('Hall name').fill('Hall 2');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    const hall2 = page.locator('[data-slot="card"]', {
      has: page.getByText('Hall 2', { exact: true }),
    });
    await expect(hall2.getByText('No docks in this hall yet.')).toBeVisible();

    await hall2.getByRole('button', { name: 'Dock' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Code').fill('D-01');
    await dialog.getByLabel('Temperature zone').selectOption({ label: 'Chilled' });
    await dialog.getByRole('checkbox', { name: 'Dangerous goods (ADR) allowed' }).check();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('This code is already used at this site.')).toBeVisible();

    await dialog.getByLabel('Code').fill('K-01');
    await dialog.getByRole('button', { name: 'Save' }).click();
    const row = hall2.getByRole('row', { name: /K-01/ });
    await expect(row).toContainText('Chilled');
    await expect(row).toContainText('Yes');
    await expect(row.getByLabel('Booked as, dock K-01')).toHaveValue('none');
    await expect(page.getByText('5 of 60')).toBeVisible();

    // Inactive docks do not count toward core.max_docks; maintenance docks do.
    await row.getByRole('button', { name: 'Edit dock K-01' }).click();
    await dialog.getByLabel('Status').selectOption({ label: 'Inactive' });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('4 of 60')).toBeVisible();
    await row.getByRole('button', { name: 'Edit dock K-01' }).click();
    await dialog.getByLabel('Status').selectOption({ label: 'Maintenance' });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(row).toContainText('Maintenance');
    await expect(page.getByText('5 of 60')).toBeVisible();
  });
});
