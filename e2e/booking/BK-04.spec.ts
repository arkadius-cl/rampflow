import { expect, type Page, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs, type World } from '../support/auth.ts';
import { at, emailWithSubject, type PlanSite, planSite } from '../support/u6b.ts';
import { berlinDay, dayButton, fillSlot } from '../support/u8.ts';

/** Walks the wizard to the avis step for `day` at `time`, with the avis filled in. */
async function upToAvis(page: Page, w: World, site: PlanSite, day: string, time: string) {
  await page.goto(`/c/${w.A.carrierId}/book`);
  await page.getByLabel('Site', { exact: true }).selectOption(site.siteId);
  await page.getByLabel('Load units', { exact: true }).fill('4');
  await expect(page.getByText(/^4 load units take \d+ minutes/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'When' })).toBeVisible();
  await dayButton(page, day).click();
  await page.getByRole('button', { name: time, exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Avis' })).toBeVisible();
  await page.getByLabel('Reference 1', { exact: true }).fill('PO-77812');
  await page.getByLabel('Supplier').fill('Elektro Nord AG');
}

test.describe('BK-04 Book a slot', () => {
  test('a carrier books an offered start and the page and the email show code, QR, address and slot in site time', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    await signInAs(context, w.A.users.carrier_user);
    const day = berlinDay(1);

    await upToAvis(page, w, site, day, '10:00');
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Confirm booking' }).click();

    await expect(
      page.getByRole('heading', { name: 'Booked. The warehouse expects you.' }),
    ).toBeVisible();
    const code = (await page.getByTestId('booking-code').textContent())?.trim() ?? '';
    expect(code).toMatch(/^[0-9A-Z]{8}$/);
    await expect(page.getByRole('img', { name: `QR code of booking ${code}` })).toBeVisible();
    await expect(page.getByText('Hafenstr. 1')).toBeVisible();
    await expect(
      page
        .locator('dd')
        .filter({ hasText: /10:00\s*CES?T/ })
        .first(),
    ).toBeVisible();
    await expectAccessible(page);

    const email = await emailWithSubject(w.A.users.carrier_user.email, `Booking ${code} confirmed`);
    expect(email.text).toContain(code);
    expect(email.text).toContain('Hafenstr. 1');
    expect(email.text).toMatch(/10:00/);
  });

  test('when another carrier takes the last unit first, the time step shows the refreshed starts and keeps the form', async ({
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    const site = await planSite(w);
    await signInAs(context, w.A.users.carrier_user);
    const day = berlinDay(1);

    await upToAvis(page, w, site, day, '10:00');
    await fillSlot(request, w.A, site, at('10:00', day));
    await page.getByRole('button', { name: 'Confirm booking' }).click();

    await expect(page.getByText('That time was just taken. Pick another one.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'When' })).toBeVisible();
    await expect(page.getByRole('button', { name: '10:00', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '10:30', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByLabel('Reference 1', { exact: true })).toHaveValue('PO-77812');
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(
      page.getByRole('heading', { name: 'Booked. The warehouse expects you.' }),
    ).toBeVisible();
    await expect(
      page
        .locator('dd')
        .filter({ hasText: /10:30\s*CES?T/ })
        .first(),
    ).toBeVisible();
  });
});
