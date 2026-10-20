import { expect, test } from '@playwright/test';
import { LoadStatus } from '../../packages/shared/src/modules/booking/values.ts';
import { seedWorld, signInAs } from '../support/auth.ts';
import { bookingStatus, openStation, seedVisit, siteOf } from '../support/u9.ts';

test.describe('YD-05 Check out', () => {
  test('leaving before done needs a reason; after done it does not', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const early = await seedVisit(w, {
      carrier: 'Abbrecher GmbH',
      plate: 'HHAB1',
      start: -30,
      status: LoadStatus.checked_in,
    });
    const done = await seedVisit(w, {
      carrier: 'Fertig KG',
      plate: 'HHFK2',
      start: -60,
      status: LoadStatus.done,
    });
    await signInAs(context, w.A.users.gate_operator);
    await openStation(page, `/t/${w.A.tenantId}/gate?site=${siteOf(w).id}&tab=onsite`);

    await page
      .getByTestId('gate-row')
      .filter({ hasText: 'Abbrecher GmbH' })
      .getByRole('button', { name: 'Check out' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Check out Abbrecher GmbH' });
    const confirm = dialog.getByRole('button', { name: 'Check out' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Reason for leaving before loading is done').fill('Wrong papers');
    await confirm.click();
    await expect(page.getByText('Abbrecher GmbH has left.')).toBeVisible();
    expect(await bookingStatus(early.id)).toBe('departed');

    await page
      .getByTestId('gate-row')
      .filter({ hasText: 'Fertig KG' })
      .getByRole('button', { name: 'Check out' })
      .click();
    const second = page.getByRole('dialog', { name: 'Check out Fertig KG' });
    await expect(second.getByLabel('Reason for leaving before loading is done')).toHaveCount(0);
    await second.getByRole('button', { name: 'Check out' }).click();
    await expect(page.getByText('Fertig KG has left.')).toBeVisible();
    expect(await bookingStatus(done.id)).toBe('departed');

    await page.getByRole('tab', { name: /Departed/ }).click();
    await expect(page.getByTestId('gate-row')).toHaveCount(2);
  });
});
