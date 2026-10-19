import { expect, test } from '@playwright/test';
import { seedWorld, signInAs } from '../support/auth.ts';
import { bookingStatus, poolDocks, seedVisit, siteOf } from '../support/u9.ts';

test.describe('YD-08 Dock progress', () => {
  test('one tap each sets at dock, loading and done; done takes actual units and frees the dock', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await poolDocks(w);
    const s = siteOf(w);
    const visit = await seedVisit(w, {
      carrier: 'Ladung AG',
      plate: 'HHLA1',
      start: -10,
      status: 'called',
      dockId: s.dockIds[1],
    });
    await signInAs(context, w.A.users.dock_operator);
    await page.goto(`/t/${w.A.tenantId}/docks?site=${s.id}`);

    const dock = page.getByTestId('dock-D-02');
    await dock.getByRole('button', { name: 'At dock' }).click();
    await expect(dock).toContainText('At dock');
    await dock.getByRole('button', { name: 'Loading' }).click();
    await expect(dock.getByRole('status').or(dock).first()).toContainText('Loading');
    await dock.getByRole('button', { name: 'Done' }).click();

    const dialog = page.getByRole('dialog', { name: 'Loading done: Ladung AG' });
    await expect(dialog.getByLabel('Actual load units')).toHaveValue('12');
    await dialog.getByLabel('Actual load units').fill('11');
    await dialog.getByLabel('Discrepancy note').fill('One pallet damaged');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('dock-D-02')).toContainText('Free');
    expect(await bookingStatus(visit.id)).toBe('done');
  });
});
