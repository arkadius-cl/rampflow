import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { overrideEntitlement, poolWorldDocks, siteOf } from '../support/u4.ts';

test.describe('MD-03 Bookable resources', () => {
  test('a dock is in one pool or a single dock: moving it updates both views', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await poolWorldDocks(context, w);
    await page.goto(`/t/${w.A.tenantId}/sites/${w.A.sites[0]?.id}`);
    const bookedAs = (code: string) => page.getByLabel(`Booked as, dock ${code}`);
    const member = (code: string) => page.getByRole('checkbox', { name: code, exact: true });
    await expect(page.getByLabel('Resource')).toHaveValue(siteOf(w.A).resourceId);
    await expect(member('D-01')).toBeChecked();
    await expectAccessible(page);

    await bookedAs('D-01').selectOption({ label: 'Single dock' });
    await expect(page.getByText('Dock D-01 updated')).toBeVisible();
    await expect(bookedAs('D-01')).toHaveValue('single');
    await expect(member('D-01')).toBeDisabled();
    await expect(page.getByText('single dock', { exact: true })).toBeVisible();

    await bookedAs('D-01').selectOption({ label: 'Pool Ramp pool' });
    await expect(member('D-01')).toBeChecked();
    await expect(member('D-01')).toBeEnabled();

    // A new pool takes only free docks: D-02 is released first, then joins "Outbound".
    await bookedAs('D-02').selectOption({ label: 'Not bookable' });
    await expect(bookedAs('D-02')).toHaveValue('none');
    await page.getByRole('button', { name: 'New pool' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Outbound');
    await page.getByRole('button', { name: 'Outbound', exact: true }).click();
    await page.getByRole('button', { name: 'Inbound', exact: true }).click();
    await expect(member('D-01')).toBeDisabled();
    await member('D-02').check();
    await page.getByRole('button', { name: 'Create pool' }).click();
    await expect(page.getByText('Outbound saved')).toBeVisible();
    await expect(bookedAs('D-02')).toHaveValue(/^pool:/);
    await expect(bookedAs('D-02').locator('option:checked')).toHaveText('Pool Outbound');
  });

  test('lowering capacity warns that bookings show as over capacity and cancels nothing', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await poolWorldDocks(context, w);
    await page.goto(`/t/${w.A.tenantId}/sites/${w.A.sites[0]?.id}`);
    const warning = page.getByText('Lowering capacity never cancels bookings.', { exact: false });
    await expect(page.getByLabel('Parallel slots')).toHaveValue('2');
    await expect(warning).toHaveCount(0);
    await page.getByLabel('Parallel slots').fill('1');
    await expect(warning).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Ramp pool saved')).toBeVisible();
    await expect(warning).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel('Parallel slots')).toHaveValue('1');
  });

  test('without booking.pools no pool can be created, and existing pools stay', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await poolWorldDocks(context, w);
    await overrideEntitlement(w, w.A.tenantId, 'booking.pools', false);
    await page.goto(`/t/${w.A.tenantId}/sites/${w.A.sites[0]?.id}`);
    await expect(page.getByText('Your package does not include pools.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New pool' })).toBeDisabled();
    await expect(page.getByLabel('Booked as, dock D-01')).toBeDisabled();
    await expect(page.getByLabel('Booked as, dock D-01').locator('option:checked')).toHaveText(
      'Pool Ramp pool',
    );
  });
});
