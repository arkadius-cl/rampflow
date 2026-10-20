import { expect } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { expectTouchTargets, openStation, poolDocks, siteOf, test } from '../support/u9.ts';

test.describe('YD-03 Walk-in', () => {
  test('a gate operator walks in an unbooked truck at a closed site and checks it in', async ({
    page,
    context,
    request,
  }) => {
    // The world's sites have no opening hours: every walk-in arrives "before opening".
    const w = await seedWorld(request);
    await poolDocks(w);
    await signInAs(context, w.A.users.gate_operator);
    await openStation(page, `/t/${w.A.tenantId}/gate?site=${siteOf(w).id}`);
    await page.getByRole('button', { name: 'Walk-in' }).click();

    const dialog = page.getByRole('dialog', { name: 'Walk-in: truck without a booking' });
    await expectAccessible(page);
    await expectTouchTargets(page);
    await dialog.getByRole('button', { name: 'Check in now' }).click();
    await expect(dialog.getByText('Fill in this field.').first()).toBeVisible();

    await dialog.getByLabel('Carrier').fill('Fremdspedition Kowalski');
    await dialog.getByLabel('Plate seen at the gate').fill('po 12345');
    await dialog.getByLabel('Load type').selectOption({ label: 'Pallets' });
    await dialog.getByLabel('Counterparty').fill('Lieferant GmbH');
    await dialog.getByLabel('Reference', { exact: true }).fill('LS-4711');
    await dialog.getByLabel('Quantity').fill('8');
    await dialog.getByRole('button', { name: 'Check in now' }).click();
    await expect(page.getByText('Walk-in Fremdspedition Kowalski recorded.')).toBeVisible();

    await page.getByRole('tab', { name: /On site/ }).click();
    const row = page.getByTestId('gate-row').filter({ hasText: 'Fremdspedition Kowalski' });
    await expect(row).toContainText('PO12345');
    await expect(row).toContainText('Walk-in');
  });

  test('a walk-in turned away records the unbooked truck', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await poolDocks(w);
    await signInAs(context, w.A.users.gate_operator);
    await openStation(page, `/t/${w.A.tenantId}/gate?site=${siteOf(w).id}&walkin=1`);
    const dialog = page.getByRole('dialog', { name: 'Walk-in: truck without a booking' });
    await dialog.getByLabel('Carrier').fill('Fremdspedition Kowalski');
    await dialog.getByLabel('Plate seen at the gate').fill('PO 99');
    await dialog.getByLabel('Load type').selectOption({ label: 'Pallets' });
    await dialog.getByLabel('Turn away instead').selectOption('wrong_load');
    await dialog.getByRole('button', { name: 'Turn away' }).click();
    await expect(page.getByText('Walk-in Fremdspedition Kowalski recorded.')).toBeVisible();
    await page.getByRole('tab', { name: /Departed/ }).click();
    await expect(page.getByTestId('gate-row')).toContainText('Turned away');
  });
});
