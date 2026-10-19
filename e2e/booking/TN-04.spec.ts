import { expect, type Page, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs, type World } from '../support/auth.ts';
import { uniqueEmail } from '../support/db.ts';
import { latestEmailTo, linkIn } from '../support/mailpit.ts';
import { emailMatching, setSiteSetting } from '../support/u7.ts';

/** Creates the first site's link on the Links tab and returns its slug. */
async function createLink(page: Page, w: World): Promise<string> {
  await page.goto(`/t/${w.A.tenantId}/carriers?tab=links`);
  await page.getByRole('button', { name: 'Create link' }).first().click();
  const shown = page.getByTestId('public-link').first();
  await expect(shown).toBeVisible();
  return (await shown.innerText()).split('/r/')[1] as string;
}

/** Registers through the public link and confirms the email in a fresh browser. */
async function registerAndConfirm(page: Page, slug: string, email: string) {
  await page.goto(`/r/${slug}`);
  await page.getByLabel('Company name').fill('Baltic Freight UAB');
  await page.getByLabel('Country').selectOption('LT');
  await page.getByLabel('Your name').fill('Rasa Jankauskiene');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();
  const link = new URL(linkIn((await latestEmailTo(email)).text, '/carrier-registration#'));
  await page.goto(`${link.pathname}${link.hash}`);
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/tenants$/);
}

test.describe('TN-04 Public booking link', () => {
  // Each test waits for one or more outbox ticks (every 5 seconds) on a shared machine.
  test.describe.configure({ timeout: 90_000 });

  test('a link answers only while its site setting is on; replacing it retires the old slug', async ({
    browser,
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.dispatcher);
    const slug = await createLink(page, w);
    await expect(page.getByRole('row', { name: new RegExp(slug) }).getByText('Off')).toBeVisible();
    await expectAccessible(page);

    const visitor = await browser.newContext();
    const tab = await visitor.newPage();
    await tab.goto(`/r/${slug}`);
    await expect(tab.getByText('Link not available')).toBeVisible();

    const site = w.A.sites[0]?.id as string;
    const on = { tenantId: w.A.tenantId, siteId: site, by: w.A.users.tenant_admin.id };
    await setSiteSetting({ ...on, key: 'booking.public_link_enabled', value: true });
    await tab.goto(`/r/${slug}`);
    await expect(tab.getByRole('button', { name: 'Register' })).toBeVisible();
    await expectAccessible(tab);

    await page.reload();
    const row = page.getByRole('row', { name: new RegExp(slug) });
    await expect(row.getByText('On', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Replace link' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Replace link' }).click();
    await expect(page.getByRole('row', { name: new RegExp(slug) })).toHaveCount(0);

    await tab.goto(`/r/${slug}`);
    await expect(tab.getByText('Link not available')).toBeVisible();
    await visitor.close();
  });

  test('approving a pending registration links the carrier and emails it; rejecting emails the reason', async ({
    browser,
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.dispatcher);
    const slug = await createLink(page, w);
    const site = w.A.sites[0]?.id as string;
    const by = w.A.users.tenant_admin.id;
    await setSiteSetting({
      tenantId: w.A.tenantId,
      siteId: site,
      by,
      key: 'booking.public_link_enabled',
      value: true,
    });

    const approveMe = uniqueEmail('approve');
    const rejectMe = uniqueEmail('reject');
    for (const email of [approveMe, rejectMe]) {
      const visitor = await browser.newContext();
      await registerAndConfirm(await visitor.newPage(), slug, email);
      await visitor.close();
    }

    await page.goto(`/t/${w.A.tenantId}/carriers?tab=registrations`);
    const approveRow = page.getByRole('row', { name: new RegExp(approveMe) });
    await expect(approveRow.getByText('Waiting for approval')).toBeVisible();
    await expectAccessible(page);
    await approveRow.getByRole('button', { name: 'Approve' }).click();
    await expect(approveRow.getByText('Approved')).toBeVisible();
    await emailMatching(approveMe, /approved your registration$/);

    const rejectRow = page.getByRole('row', { name: new RegExp(rejectMe) });
    await rejectRow.getByRole('button', { name: 'Reject' }).click();
    await page.getByRole('dialog').getByLabel('Reason').fill('We only work with ADR carriers.');
    await page.getByRole('dialog').getByRole('button', { name: 'Reject registration' }).click();
    await expect(rejectRow.getByText('Rejected')).toBeVisible();
    const rejected = await emailMatching(rejectMe, /declined your registration$/);
    expect(rejected.text).toContain('We only work with ADR carriers.');

    await page.goto(`/t/${w.A.tenantId}/carriers`);
    await expect(page.getByRole('row', { name: /Baltic Freight UAB/ })).toHaveCount(1);
    const linked = page.getByRole('row', { name: /Baltic Freight UAB/ });
    await expect(linked.getByText('Public link')).toBeVisible();
  });
});
