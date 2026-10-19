import { expect, type Page, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInAs } from '../support/auth.ts';
import { setPassword, uniqueEmail } from '../support/db.ts';
import { latestEmailTo, linkIn } from '../support/mailpit.ts';
import { carrierOf, linkStatus } from '../support/u7.ts';

/** The tenant invites `email` through the carriers screen; returns the emailed link's path. */
async function invite(page: Page, tenantId: string, company: string, email: string) {
  await page.goto(`/t/${tenantId}/carriers`);
  await page.getByRole('button', { name: 'Invite carrier' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Company name').fill(company);
  await dialog.getByLabel('Email', { exact: true }).fill(email);
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('cell', { name: email })).toBeVisible();
  const link = new URL(linkIn((await latestEmailTo(email)).text, '/carrier-invite#'));
  return `${link.pathname}${link.hash}`;
}

test.describe('CR-01 Accept a carrier invitation', () => {
  // Each test waits for one or more outbox ticks (every 5 seconds) on a shared machine.
  test.describe.configure({ timeout: 90_000 });

  test('a new user creates the company account once; the token never reaches a request URL', async ({
    browser,
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.dispatcher);
    const email = uniqueEmail('newcarrier');
    const path = await invite(page, w.A.tenantId, 'Nowak Transport', email);
    const token = path.split('#')[1] as string;

    const carrier = await browser.newContext();
    const tab = await carrier.newPage();
    const urls: string[] = [];
    tab.on('request', (r) => urls.push(r.url()));
    await tab.goto(path);
    await expect(
      tab.getByText(/invites Nowak Transport to book slots on rampflow\./),
    ).toBeVisible();
    await expect(tab).toHaveURL(/\/carrier-invite$/);
    await expectAccessible(tab);

    await tab.getByLabel('Your name').fill('Piotr Nowak');
    await expect(tab.getByLabel('Company name')).toHaveValue('Nowak Transport');
    await tab.getByLabel('New password').fill('carrier password 2026');
    await tab.getByLabel('Repeat the password').fill('carrier password 2026');
    await tab.getByRole('button', { name: 'Create account and accept' }).click();

    await expect(tab).toHaveURL(/\/c\/[0-9a-f-]{36}\/tenants$/);
    const carrierId = await carrierOf(email);
    expect(new URL(tab.url()).pathname).toBe(`/c/${carrierId}/tenants`);
    await expect(tab.getByRole('row', { name: /^Tenant A / }).getByText('Can book')).toBeVisible();
    await expect(tab.getByTestId('org-switcher')).toContainText('Nowak Transport');
    await expectAccessible(tab);
    expect(await linkStatus(w.A.tenantId, carrierId as string)).toBe('active');
    expect(urls.filter((u) => u.includes(token))).toEqual([]);

    await tab.goto(path);
    await expect(tab.getByText('Invitation not valid')).toBeVisible();
    await carrier.close();
  });

  test("an existing carrier user signs in on the page and the invitation links that user's company", async ({
    browser,
    page,
    context,
    request,
  }) => {
    const w = await seedWorld(request);
    await signInAs(context, w.A.users.dispatcher);
    const existing = w.B.users.carrier_admin;
    await setPassword(existing.id, 'existing password 1');
    const path = await invite(page, w.A.tenantId, 'Whatever Name', existing.email);

    const carrier = await browser.newContext();
    const tab = await carrier.newPage();
    await tab.goto(path);
    await expect(tab.getByText('This email already has an account.')).toBeVisible();
    await tab.getByLabel('Password', { exact: true }).fill('existing password 1');
    await tab.getByRole('button', { name: 'Sign in and accept' }).click();
    await expect(tab).toHaveURL(new RegExp(`/c/${w.B.carrierId}/tenants$`));
    await expect(tab.getByRole('row', { name: /^Tenant A / })).toBeVisible();
    expect(await linkStatus(w.A.tenantId, w.B.carrierId)).toBe('active');
    await carrier.close();
  });
});
