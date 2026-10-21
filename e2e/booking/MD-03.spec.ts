import { expect, test } from '@playwright/test';
import { TemperatureZone } from '../../packages/shared/src/modules/core/values.ts';
import { HttpMethod } from '../../packages/shared/src/values/http.ts';
import { APP_ORIGIN, expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { overrideEntitlement, poolWorldDocks, siteOf } from '../support/u4.ts';

test.describe('MD-03 Bookable resources', () => {
  test('a dock is in exactly one resource: moving it updates both views', async ({
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
    await expect(bookedAs('D-01').getByRole('option', { name: 'Not bookable' })).toHaveCount(0);
    await expectAccessible(page);

    await bookedAs('D-01').selectOption({ label: 'Single dock' });
    await expect(page.getByText('Dock D-01 updated')).toBeVisible();
    await expect(bookedAs('D-01')).toHaveValue('single');
    await expect(member('D-01')).not.toBeChecked();
    await expect(page.getByText('booked on its own, moves here')).toBeVisible();

    await bookedAs('D-01').selectOption({ label: 'Pool Ramp pool' });
    await expect(member('D-01')).toBeChecked();

    // A new pool takes docks from where they are: D-02 moves out of "Ramp pool".
    await page.getByRole('button', { name: 'New pool' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Outbound');
    await page.getByRole('button', { name: 'Outbound', exact: true }).click();
    await page.getByRole('button', { name: 'Inbound', exact: true }).click();
    await expect(page.getByText('moves from Ramp pool')).toHaveCount(2);
    await member('D-02').check();
    await page.getByRole('button', { name: 'Create pool' }).click();
    await expect(page.getByText('Outbound saved')).toBeVisible();
    await expect(bookedAs('D-02').locator('option:checked')).toHaveText('Pool Outbound');
    await expect(bookedAs('D-01').locator('option:checked')).toHaveText('Pool Ramp pool');

    // A dock taken out of a manual pool goes back to the pool of its hall.
    await member('D-01').check();
    await member('D-02').uncheck();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Outbound saved')).toBeVisible();
    await expect(bookedAs('D-01').locator('option:checked')).toHaveText('Pool Outbound');
    await expect(bookedAs('D-02').locator('option:checked')).toHaveText('Pool Hall 1');
  });

  test('a dock whose profile changed meanwhile is refused with the profile text', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const s = siteOf(w.A);
    await signInAs(context, w.A.users.tenant_admin);
    await poolWorldDocks(context, w);
    await page.goto(`/t/${w.A.tenantId}/sites/${s.id}`);
    const member = (code: string) => page.getByRole('checkbox', { name: code, exact: true });
    await page.getByRole('button', { name: 'New pool' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Express');
    await member('D-01').check();
    await member('D-02').check();

    // Another admin makes D-01 frozen while this form is open.
    const changed = await context.request.fetch(
      `/api/t/${w.A.tenantId}/sites/${s.id}/docks/${s.dockIds[0]}`,
      {
        method: HttpMethod.PATCH,
        data: { temperatureZone: TemperatureZone.frozen },
        headers: { Origin: APP_ORIGIN },
      },
    );
    expect(changed.ok()).toBe(true);

    await page.getByRole('button', { name: 'Create pool' }).click();
    await expect(
      page.getByText('These docks have another door type, temperature zone or ADR setting'),
    ).toBeVisible();
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
