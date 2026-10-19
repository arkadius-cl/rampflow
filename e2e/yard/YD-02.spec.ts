import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import {
  bookingStatus,
  expectTouchTargets,
  publishBriefing,
  seedVisit,
  siteOf,
} from '../support/u9.ts';

test.describe('YD-02 Check in', () => {
  test('the gate checks a truck in with the plate as seen; it moves to the on-site list', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const visit = await seedVisit(w, {
      carrier: 'Nordfrost Transport',
      plate: 'HHNF204',
      start: 5,
    });
    await signInAs(context, w.A.users.gate_operator);
    await page.goto(`/t/${w.A.tenantId}/gate?site=${siteOf(w).id}&checkin=${visit.id}`);

    const dialog = page.getByRole('dialog', { name: 'Check in Nordfrost Transport' });
    await expect(dialog.getByText('Early tolerance 30 min, grace 15 min.')).toBeVisible();
    await expect(dialog.getByText('On time')).toBeVisible();
    await expectAccessible(page);
    await expectTouchTargets(page);
    await dialog.getByLabel('Plate as seen').fill('hh-nf 205');
    await dialog.getByRole('button', { name: 'Check in now' }).click();
    await expect(page.getByText('Nordfrost Transport is checked in.')).toBeVisible();
    expect(await bookingStatus(visit.id)).toBe('checked_in');

    await page.getByRole('tab', { name: /On site/ }).click();
    const row = page.getByTestId('gate-row').filter({ hasText: 'Nordfrost Transport' });
    await expect(row).toContainText('HHNF205');
    await expect(row).toContainText('Checked in');
  });

  test('a required briefing keeps check-in disabled with the reason; turn away needs a listed reason', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await publishBriefing(w);
    const visit = await seedVisit(w, { carrier: 'Romtrans SRL', plate: 'B44RTR', start: 0 });
    await signInAs(context, w.A.users.gate_operator);
    await page.goto(`/t/${w.A.tenantId}/gate?site=${siteOf(w).id}`);
    await expect(page.getByTestId('gate-row')).toContainText('Briefing missing');
    await page.getByRole('button', { name: 'Check in' }).click();

    const dialog = page.getByRole('dialog', { name: 'Check in Romtrans SRL' });
    await expect(dialog.getByRole('button', { name: 'Check in now' })).toBeDisabled();
    await expect(
      dialog.getByText('Check-in is disabled until a valid briefing is linked.'),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Start briefing here' })).toBeEnabled();
    await expectAccessible(page);

    const turnAway = dialog.getByRole('button', { name: 'Turn away' });
    await expect(turnAway).toBeDisabled();
    await dialog.getByLabel('Turn away instead').selectOption('safety_not_completed');
    await turnAway.click();
    await expect(page.getByText('Romtrans SRL was turned away.')).toBeVisible();
    expect(await bookingStatus(visit.id)).toBe('turned_away');
    await page.getByRole('tab', { name: /Departed/ }).click();
    await expect(page.getByTestId('gate-row')).toContainText('Turned away');
  });
});
