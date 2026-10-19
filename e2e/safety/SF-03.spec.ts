import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { acknowledge, bookingsOf, publishedBriefing } from '../support/u5.ts';

const DAY = 86_400_000;

test.describe('SF-03 Acknowledgement register', () => {
  test('a dispatcher filters by driver, carrier, site, version and expiry, and exports the CSV', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const briefing = await publishedBriefing(request, w.A, 'Site rules');
    const { own, rival, otherSite } = bookingsOf(w.A);
    const now = Date.now();
    const ack = (booking: typeof own, driverName: string, daysAgo: number, validDays: number) =>
      acknowledge({
        side: w.A,
        instructionId: briefing.id,
        booking,
        driverName,
        completedAt: new Date(now - daysAgo * DAY),
        validDays,
      });
    await ack(own, 'Jan Kowalski', 2, 365);
    await ack(rival, 'Anna Nowak', 3, 365);
    await ack(otherSite, 'Piotr Zieliński', 1, 365);
    await ack(own, 'Ewa Expired', 40, 30);

    await signInAs(context, w.A.users.dispatcher);
    await page.goto(`/t/${w.A.tenantId}/safety/acknowledgements`);
    await expect(page.getByRole('heading', { name: 'Acknowledgements' })).toBeVisible();
    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(rows).toHaveCount(4);
    const kowalski = page.getByRole('row', { name: /Jan Kowalski/ });
    await expect(kowalski.getByText(own.code)).toBeVisible();
    await expect(kowalski.getByText('Valid')).toBeVisible();
    await expect(kowalski.getByText('Polish')).toBeVisible();
    await expect(kowalski.locator('time')).toContainText(/\d{2}:\d{2}\s*CES?T/);
    await expectAccessible(page);

    await page.getByLabel('Driver name').fill('kowal');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Jan Kowalski');
    await page.getByLabel('Driver name').fill('');
    await expect(rows).toHaveCount(4);

    await page
      .getByLabel('Carrier')
      .selectOption({ label: `Carrier ${rival.carrierId.slice(0, 4)}` });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Anna Nowak');
    await page.getByRole('button', { name: 'Reset filters' }).click();

    await page.getByLabel('Site').selectOption({ label: 'Site 2' });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Piotr Zieliński');
    await page.getByRole('button', { name: 'Reset filters' }).click();

    await page.getByLabel('Briefing').selectOption({ label: 'Site rules' });
    await page.getByLabel('Version').selectOption({ label: 'v1' });
    await expect(rows).toHaveCount(4);

    await page.getByLabel('Status').selectOption({ label: 'Expired' });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Ewa Expired');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const file = await readFile(await (await download).path());
    expect([...file.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = file.subarray(3).toString('utf8').split('\r\n');
    expect(lines[0]).toBe(
      'Completed at,Valid until,Status,Driver,Carrier,Booking,Site,Briefing,Version,Language,Quiz score (%),Attempts,Channel',
    );
    expect(lines.slice(1).filter(Boolean)).toHaveLength(1);
    expect(lines[1]).toContain('Ewa Expired');
  });

  test('a gate operator has no register', async ({ page, context, request }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.gate_operator);
    await page.goto(`/t/${w.A.tenantId}/safety/acknowledgements`);
    await expect(page.getByText('No access')).toBeVisible();
  });
});
