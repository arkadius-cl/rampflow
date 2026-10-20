import { expect, test } from '@playwright/test';
import { LoadStatus } from '../../packages/shared/src/modules/booking/values.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import {
  bookingStatus,
  expectTouchTargets,
  openStation,
  poolDocks,
  seedVisit,
  siteOf,
} from '../support/u9.ts';

test.describe('YD-07 Assign and call', () => {
  test('the call dialog suggests a free pool dock; "Cancel call" returns the truck to the queue', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await poolDocks(w);
    const s = siteOf(w);
    await seedVisit(w, {
      carrier: 'Belegt AG',
      plate: 'HHBA1',
      start: -30,
      status: LoadStatus.at_dock,
      dockId: s.dockIds[0],
    });
    const waiting = await seedVisit(w, {
      carrier: 'Wartend GmbH',
      plate: 'HHWG2',
      start: -5,
      status: LoadStatus.checked_in,
      phone: '+48600111222',
    });
    await signInAs(context, w.A.users.dock_operator);
    await openStation(page, `/t/${w.A.tenantId}/docks?site=${s.id}`);

    await page.getByTestId('queue-item').getByRole('button', { name: 'Call to dock' }).click();
    const dialog = page.getByRole('dialog', { name: 'Call Wartend GmbH to a dock' });
    await expect(dialog.getByRole('button', { name: /^D-01/ })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: /^D-02/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByRole('button', { name: /^D-02/ })).toContainText('suggested');
    await expect(dialog.locator('a[href^="tel:"]')).toHaveAttribute('href', 'tel:+48600111222');
    await expectAccessible(page);
    await expectTouchTargets(page);
    await dialog.getByRole('button', { name: 'Call to D-02' }).click();
    await expect(page.getByText('Wartend GmbH called to D-02.')).toBeVisible();
    expect(await bookingStatus(waiting.id)).toBe('called');

    const dock = page.getByTestId('dock-D-02');
    await expect(dock).toContainText('Wartend GmbH');
    await expect(dock).toContainText('Called');
    await expect(page.getByTestId('queue-item')).toHaveCount(0);
    await dock.getByRole('button', { name: 'Cancel call' }).click();
    await expect(page.getByTestId('dock-D-02')).toContainText('Free');
    await expect(page.getByTestId('queue-item')).toContainText('Wartend GmbH');
    expect(await bookingStatus(waiting.id)).toBe('checked_in');
  });

  test('a gate operator calls from the on-site list too', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await poolDocks(w);
    const visit = await seedVisit(w, {
      carrier: 'Torruf KG',
      plate: 'HHTK1',
      start: 0,
      status: LoadStatus.checked_in,
    });
    await signInAs(context, w.A.users.gate_operator);
    await openStation(page, `/t/${w.A.tenantId}/gate?site=${siteOf(w).id}&tab=onsite`);
    await page.getByRole('button', { name: 'Call to dock' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Call to D-01' }).click();
    await expect(page.getByText('Torruf KG called to D-01.')).toBeVisible();
    expect(await bookingStatus(visit.id)).toBe('called');
  });
});
