import { expect, type Page, test } from '@playwright/test';
import { CookieName } from '../../packages/shared/src/values/http.ts';
import { expectAccessible } from '../support/auth.ts';
import {
  attemptsOf,
  driverWorld,
  gateDeviceToken,
  linkOf,
  ownAddress,
  type PublishedBriefing,
  publishBriefing,
  writeCounts,
} from '../support/u10.ts';

async function readAllRules(page: Page) {
  const toQuiz = page.getByRole('button', { name: 'I have read this. Go to the quiz' });
  await expect(page.getByRole('progressbar', { name: 'Briefing progress' })).toBeVisible();
  while (!(await toQuiz.isVisible())) await page.getByRole('button', { name: 'Next rule' }).click();
  await toQuiz.click();
}

async function answer(page: Page, briefing: PublishedBriefing, right: boolean) {
  await expect(page.getByRole('heading', { name: 'Quick check' })).toBeVisible();
  for (const q of briefing.questions) {
    const pick = right ? q.correct : (q.correct + 1) % q.options.length;
    await page.getByRole('radio', { name: q.options[pick], exact: true }).check();
  }
  await page.getByRole('button', { name: 'Check answers' }).click();
}

async function confirmAs(page: Page, name: string) {
  await expect(page.getByRole('heading', { name: 'Confirm the briefing' })).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm briefing' }).click();
}

test.describe('SF-04 Complete the briefing', () => {
  test('a failed quiz shows the rules again and counts; a pass and the confirmation make the briefing valid', async ({
    page,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    const briefing = await publishBriefing(request, w.A);
    const visit = w.A.bookings.own;
    await page.goto(linkOf(visit.driverToken));
    await expect(page.getByRole('heading', { name: 'Safety briefing required' })).toBeVisible();
    await page.getByRole('button', { name: 'Start safety briefing' }).click();

    await readAllRules(page);
    await expectAccessible(page);
    await answer(page, briefing, false);
    await expect(page.getByText('Some answers were not correct.')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Briefing progress' })).toBeVisible();
    expect(await attemptsOf(visit.id)).toBe(1);

    await readAllRules(page);
    await answer(page, briefing, true);
    await expect(page.getByRole('heading', { name: 'Confirm the briefing' })).toBeVisible();
    expect(await attemptsOf(visit.id)).toBe(2);
    await page.getByLabel('Your name').fill('D');
    await page.getByRole('button', { name: 'Confirm briefing' }).click();
    await expect(page.getByText('Enter your first and last name.')).toBeVisible();
    await expect(page.getByText('Tick the box to confirm.')).toBeVisible();
    await expectAccessible(page);
    await confirmAs(page, 'Dana Driver');

    await expect(page.getByTestId('safety-valid')).toContainText('Safety briefing valid until');
    await expect(page.getByRole('button', { name: 'Start safety briefing' })).toHaveCount(0);
  });

  test('the next booking at the tenant on the same phone shows "valid until" instead of the briefing', async ({
    page,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    const briefing = await publishBriefing(request, w.A);
    await page.goto(linkOf(w.A.bookings.own.driverToken));
    await page.getByRole('button', { name: 'Start safety briefing' }).click();
    await readAllRules(page);
    await answer(page, briefing, true);
    await confirmAs(page, 'Dana Driver');
    await expect(page.getByTestId('safety-valid')).toBeVisible();
    expect(
      (await page.context().cookies()).find((c) => c.name === CookieName.rf_device)?.httpOnly,
    ).toBe(true);

    const before = await writeCounts(w.A.tenantId);
    await page.goto(linkOf(w.A.bookings.otherSite.driverToken));
    await expect(page.getByTestId('booking-code')).toHaveText(w.A.bookings.otherSite.code);
    await expect(page.getByTestId('safety-valid')).toContainText('Safety briefing valid until');
    await expect(page.getByRole('button', { name: 'Start safety briefing' })).toHaveCount(0);
    const after = await writeCounts(w.A.tenantId);
    expect(after.bookingAcknowledgement).toBe(before.bookingAcknowledgement + 1);
    expect(after.safetyPass).toBe(before.safetyPass);

    await page.reload();
    await expect(page.getByTestId('safety-valid')).toBeVisible();
    expect(await writeCounts(w.A.tenantId)).toEqual(after);
  });

  test('a briefing on the gate device leaves no pass and no device cookie (YD-02)', async ({
    page,
    request,
  }) => {
    await ownAddress(page);
    const w = await driverWorld(request);
    const briefing = await publishBriefing(request, w.A);
    const token = await gateDeviceToken(w.A, w.A.bookings.rival);
    await page.goto(linkOf(token));
    await expect(page.getByText(/Briefing on the gate.s device/)).toBeVisible();
    await page.getByRole('button', { name: 'Start safety briefing' }).click();
    await readAllRules(page);
    await answer(page, briefing, true);
    await confirmAs(page, 'Gina Gatehouse');
    await expect(page.getByTestId('safety-valid')).toBeVisible();
    expect((await page.context().cookies()).some((c) => c.name === CookieName.rf_device)).toBe(
      false,
    );
    expect((await writeCounts(w.A.tenantId)).safetyPass).toBe(0);
  });
});
