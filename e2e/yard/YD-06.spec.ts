import { expect } from '@playwright/test';
import { LoadStatus } from '../../packages/shared/src/modules/booking/values.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import {
  expectTouchTargets,
  openStation,
  poolDocks,
  seedVisit,
  siteOf,
  test,
} from '../support/u9.ts';

test.describe('YD-06 Dock overview', () => {
  test('docks by hall show their truck; the queue lists checked-in trucks by slot start', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await poolDocks(w);
    const s = siteOf(w);
    await seedVisit(w, {
      carrier: 'Am Tor AG',
      plate: 'HHAT1',
      start: -10,
      status: LoadStatus.loading,
      dockId: s.dockIds[0],
      phone: '+491701234567',
    });
    await seedVisit(w, {
      carrier: 'Später GmbH',
      plate: 'HHSP2',
      start: 30,
      status: LoadStatus.checked_in,
      checkedIn: -5,
    });
    await seedVisit(w, {
      carrier: 'Früher KG',
      plate: 'HHFR3',
      start: -20,
      status: LoadStatus.checked_in,
      checkedIn: -15,
    });
    await signInAs(context, w.A.users.dock_operator);
    await openStation(page, `/t/${w.A.tenantId}/docks?site=${s.id}`);

    await expect(page.getByRole('heading', { name: 'Hall 1' })).toBeVisible();
    const busy = page.getByTestId('dock-D-01');
    await expect(busy).toContainText('Am Tor AG');
    await expect(busy).toContainText('Loading');
    await expect(busy).toContainText(/since \d\d:\d\d/);
    await expect(busy.getByLabel('Call driver +491701234567')).toHaveAttribute(
      'href',
      'tel:+491701234567',
    );
    await expect(page.getByTestId('dock-D-02')).toContainText('Free');
    await expect(page.getByTestId('queue-item')).toHaveText([/Früher KG/, /Später GmbH/]);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expectAccessible(page);
    await expectTouchTargets(page);
  });
});
