import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { putOverride } from '../support/u3.ts';

test.describe('TN-02 Settings', () => {
  test('tenant and site values show their source; reset goes back to the inherited value', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);

    await page.goto(`/t/${w.A.tenantId}/settings`);
    await expect(page.getByRole('tab', { name: 'All sites' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const horizon = page.getByTestId('setting-booking.horizon_days');
    await expect(horizon).toContainText('Inherited from Default');
    await expect(horizon.getByRole('spinbutton')).toHaveValue('30');
    await expectAccessible(page);

    await horizon.getByRole('spinbutton').fill('45');
    await horizon.getByRole('button', { name: 'Save' }).click();
    await expect(horizon).toContainText('Set here (Tenant)');

    await page.getByRole('tab', { name: 'Site 1' }).click();
    await expect(page).toHaveURL(new RegExp(`site=${w.A.sites[0]?.id}`));
    await expect(horizon).toContainText('Inherited from Tenant');
    await expect(horizon.getByRole('spinbutton')).toHaveValue('45');
    await horizon.getByRole('spinbutton').fill('60');
    await horizon.getByRole('button', { name: 'Save' }).click();
    await expect(horizon).toContainText('Set here (Site)');

    await page.getByRole('tab', { name: 'Site 2' }).click();
    await expect(horizon.getByRole('spinbutton')).toHaveValue('45');
    await expect(horizon).toContainText('Inherited from Tenant');

    await page.getByRole('tab', { name: 'Site 1' }).click();
    await horizon.getByRole('button', { name: 'Reset to inherited (45)' }).click();
    await expect(horizon).toContainText('Inherited from Tenant');
    await expect(horizon.getByRole('spinbutton')).toHaveValue('45');
  });

  test('controls follow the schema and retention above the maximum is refused', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/settings`);

    const visits = page.getByTestId('setting-privacy.retention.visit_days');
    await visits.getByRole('spinbutton').fill('5000');
    await visits.getByRole('button', { name: 'Save' }).click();
    await expect(visits.getByRole('alert')).toHaveText('Enter a whole number from 30 to 3,650.');
    await expect(visits).toContainText('Inherited from Default');

    const grid = page.getByTestId('setting-booking.slot_grid_minutes');
    await grid.getByRole('combobox').selectOption('15');
    await grid.getByRole('button', { name: 'Save' }).click();
    await expect(grid).toContainText('Set here (Tenant)');

    const plate = page.getByTestId('setting-booking.require_plate');
    await plate.getByRole('switch').click();
    await plate.getByRole('button', { name: 'Save' }).click();
    await expect(plate).toContainText('Set here (Tenant)');
    await expect(plate.getByRole('switch')).toBeChecked();

    const references = page.getByTestId('setting-avis.required_reference_types');
    await references.getByRole('checkbox', { name: 'Delivery note' }).check();
    await references.getByRole('button', { name: 'Save' }).click();
    await expect(references).toContainText('Set here (Tenant)');
    await expect(references.getByRole('checkbox', { name: 'Delivery note' })).toBeChecked();

    const notice = page.getByTestId('setting-privacy.notice_url');
    await notice.getByRole('textbox').fill('ftp://example.com');
    await notice.getByRole('button', { name: 'Save' }).click();
    await expect(notice.getByRole('alert')).toBeVisible();
    await notice.getByRole('textbox').fill('https://example.com/privacy');
    await notice.getByRole('button', { name: 'Save' }).click();
    await expect(notice).toContainText('Set here (Tenant)');
  });

  test('a setting whose entitlement is off is not shown', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    await page.goto(`/t/${w.A.tenantId}/settings`);
    await expect(page.getByTestId('setting-booking.public_registration_mode')).toBeVisible();

    await putOverride(request, w, w.A.tenantId, 'booking.public_link', false);
    await page.reload();
    await expect(page.getByTestId('setting-booking.horizon_days')).toBeVisible();
    await expect(page.getByTestId('setting-booking.public_registration_mode')).toHaveCount(0);
  });
});
