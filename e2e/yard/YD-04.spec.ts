import { expect } from '@playwright/test';
import { LoadStatus } from '../../packages/shared/src/modules/booking/values.ts';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { expectTouchTargets, openStation, seedVisit, siteOf, test } from '../support/u9.ts';

test.describe('YD-04 On-site list', () => {
  test('shows state, time since gate-in and wait, and flags trucks above the detention limit', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await seedVisit(w, {
      carrier: 'Langsteher Logistik',
      plate: 'HHLL1',
      start: -180,
      checkedIn: -150,
      status: LoadStatus.checked_in,
    });
    await seedVisit(w, {
      carrier: 'Schnell Spedition',
      plate: 'HHSS2',
      start: -20,
      checkedIn: -25,
      status: LoadStatus.checked_in,
    });
    await signInAs(context, w.A.users.gate_operator);
    await openStation(page, `/t/${w.A.tenantId}/gate?site=${siteOf(w).id}&tab=onsite`);

    const long = page.getByTestId('gate-row').filter({ hasText: 'Langsteher Logistik' });
    await expect(long).toContainText(/On site 15\d min/);
    await expect(long).toContainText('Detention: over');
    const short = page.getByTestId('gate-row').filter({ hasText: 'Schnell Spedition' });
    await expect(short).toContainText(/On site 2\d min/);
    await expect(short).toContainText(/Waiting (19|20|21) min/);
    await expect(short).not.toContainText('Detention');
    await expectAccessible(page);
    await expectTouchTargets(page);
  });
});
