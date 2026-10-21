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
    await dialog.getByLabel('Temperature zone').selectOption({ label: 'Frozen' });
    await dialog.getByRole('checkbox', { name: 'Dangerous goods (ADR) allowed' }).check();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('This code is already used at this site.')).toBeVisible();

    await dialog.getByLabel('Code').fill('K-01');
    await dialog.getByRole('button', { name: 'Save' }).click();
    const row = hall2.getByRole('row', { name: /K-01/ });
    await expect(row).toContainText('Frozen');
    await expect(row).toContainText('Yes');
    // A frozen ADR dock gets the default pool of its hall and profile, named in the site's language.
    await expect(row.getByLabel('Booked as, dock K-01').locator('option:checked')).toHaveText(
      'Pool Hall 2 · Tiefkühl · ADR',
    );
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

  test('a new dock joins its hall pool and the dock dialog says what it is bookable for', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/sites/${w.A.sites[0]?.id}`);
    const hall1 = page.locator('[data-slot="card"]', {
      has: page.getByText('Hall 1', { exact: true }),
    });
    const dialog = page.getByRole('dialog');

    await hall1.getByRole('button', { name: 'Dock', exact: true }).click();
    await dialog.getByLabel('Code').fill('D-03');
    await dialog.getByRole('button', { name: 'Save' }).click();
    const row = hall1.getByRole('row', { name: /D-03/ });
    await expect(row.getByLabel('Booked as, dock D-03').locator('option:checked')).toHaveText(
      'Pool Hall 1',
    );

    await hall1.getByRole('button', { name: 'Dock', exact: true }).click();
    await dialog.getByLabel('Code').fill('D-04');
    await dialog.getByLabel('Temperature zone').selectOption({ label: 'Frozen' });
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(hall1.getByLabel('Booked as, dock D-04').locator('option:checked')).toHaveText(
      'Pool Hall 1 · Tiefkühl',
    );
    // The ambient pool cannot take the frozen dock, and says why.
    await expect(
      hall1.getByLabel('Booked as, dock D-04').getByRole('option', { name: /^Pool Hall 1:/ }),
    ).toBeDisabled();

    await row.getByRole('button', { name: 'Edit dock D-03' }).click();
    const bookable = dialog.getByRole('region', { name: 'Bookable for' });
    await expect(bookable).toContainText('Pool Hall 1');
    await expect(bookable).toContainText('Pallets');
    await expect(bookable.getByRole('link', { name: 'Edit load types' })).toHaveAttribute(
      'href',
      `/t/${w.A.tenantId}/sites/${w.A.sites[0]?.id}/load-types`,
    );
    await expectAccessible(page);
    const warning = dialog.getByText('Saving moves this dock to the pool for its new profile.');
    await expect(warning).toHaveCount(0);
    await dialog.getByLabel('Temperature zone').selectOption({ label: 'Chilled' });
    await expect(warning).toBeVisible();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(hall1.getByLabel('Booked as, dock D-03').locator('option:checked')).toHaveText(
      'Pool Hall 1 · Kühl',
    );
  });
});
