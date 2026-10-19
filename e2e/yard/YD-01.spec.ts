import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { expectTouchTargets, seedVisit, siteOf } from '../support/u9.ts';

test.describe('YD-01 Expected trucks', () => {
  test('the gate lists today with plate and safety, and a scanner code with Enter opens the check-in', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const late = await seedVisit(w, {
      carrier: 'Nordfrost Transport',
      plate: 'HHNF204',
      start: -40,
    });
    await seedVisit(w, { carrier: 'Romtrans SRL', plate: 'B44RTR', start: 60 });
    await signInAs(context, w.A.users.gate_operator);
    await page.goto(`/t/${w.A.tenantId}/gate?site=${siteOf(w).id}`);

    const rows = page.getByTestId('gate-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Nordfrost Transport');
    await expect(rows.first()).toContainText('HHNF204');
    await expect(rows.first()).toContainText(/Late 40 min/);
    await expect(rows.first()).toContainText('No briefing needed');
    await expect(rows.nth(1)).toContainText('Romtrans SRL');
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expectAccessible(page);
    await expectTouchTargets(page);

    const scan = page.getByRole('textbox', { name: 'Find booking' });
    await expect(scan).toBeFocused();
    await scan.fill(late.code.toLowerCase());
    await scan.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Check in Nordfrost Transport' });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`checkin=${late.id}`));
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await scan.fill('b44 rtr');
    await scan.press('Enter');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Romtrans SRL');
    await scan.fill('nobody');
    await scan.press('Enter');
    await expect(page.getByText('No booking found for “nobody”.')).toBeVisible();
  });

  test('?site= survives a reload; without it the device opens its last site', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.tenant_admin);
    const other = w.A.sites[1]?.id as string;
    await page.goto(`/t/${w.A.tenantId}/gate?site=${other}`);
    await expect(page.getByText('Site 2')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`site=${other}`));
    await page.goto(`/t/${w.A.tenantId}/gate`);
    await expect(page).toHaveURL(new RegExp(`site=${other}`));
  });

  test('offline, every action is disabled and nothing is sent when the connection returns', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await seedVisit(w, { carrier: 'Nordfrost Transport', plate: 'HHNF204', start: 0 });
    await signInAs(context, w.A.users.gate_operator);
    await page.goto(`/t/${w.A.tenantId}/gate?site=${siteOf(w).id}`);
    const checkIn = page.getByRole('button', { name: 'Check in' });
    await expect(checkIn).toBeEnabled();

    const commands: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/yard/')) commands.push(r.url());
    });
    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
    await expect(checkIn).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Walk-in' })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('Nothing is queued');
    await context.setOffline(false);
    await expect(checkIn).toBeEnabled();
    expect(commands).toEqual([]);
  });
});
