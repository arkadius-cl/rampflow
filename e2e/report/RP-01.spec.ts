import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { REFERENCE_DAY, seedReferenceVisits } from '../support/u11.ts';

const tile = (page: import('@playwright/test').Page, name: string) =>
  page.locator('[data-slot="card"]').filter({ has: page.getByText(name, { exact: true }) });

test.describe('RP-01 KPI dashboard', () => {
  test('a dispatcher reads the KPIs of the reference fixture and filters them', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const codes = await seedReferenceVisits(w.A);
    await signInAs(context, w.A.users.dispatcher);
    await page.goto(
      `/t/${w.A.tenantId}/reports?site=${w.A.sites[0]?.id}&from=${REFERENCE_DAY}&to=${REFERENCE_DAY}`,
    );
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();

    const expected: [string, string][] = [
      ['Bookings due', '8'],
      ['No-show rate', '25.0 %'],
      ['Late cancellations', '12.5 %'],
      ['On time', '50.0 %'],
      ['Wait', '7.5 min'],
      ['Dock dwell', '44.2 min'],
      ['Turnaround', '82.5 min'],
      ['Dock utilisation', '13.8 %'],
      ['Portal adoption', '70.0 %'],
      ['Detention visits', '1'],
    ];
    for (const [name, value] of expected) {
      await expect(tile(page, name)).toContainText(value);
    }
    await expect(tile(page, 'On time')).toContainText('Early 16.7 % · late 33.3 %');
    await expect(tile(page, 'Detention visits')).toContainText('Turnaround above 120 min');

    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(rows).toHaveCount(10);
    const first = page.getByRole('row', { name: new RegExp(codes[0] ?? '') });
    await expect(first.locator('time').first()).toContainText(/08:00\s*CET/);
    await expect(first).toContainText('Departed');
    await expectAccessible(page);

    const carrier = page.getByLabel('Carrier');
    const rival = await carrier.locator('option', { hasText: 'Rival' }).getAttribute('value');
    await carrier.selectOption(rival ?? '');
    await expect(tile(page, 'Bookings due')).toContainText('0');
    await expect(tile(page, 'No-show rate')).toContainText('–');
    await carrier.selectOption('');
    await expect(tile(page, 'Bookings due')).toContainText('8');

    await page.getByLabel('Resource').selectOption({ label: 'Ramp pool' });
    await expect(tile(page, 'Dock utilisation')).toContainText('–');
  });

  test('a gate operator has no reports', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.gate_operator);
    await page.goto(`/t/${w.A.tenantId}/reports`);
    await expect(page.getByText('No access')).toBeVisible();
  });
});
