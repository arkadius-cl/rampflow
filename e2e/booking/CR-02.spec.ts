import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, type World } from '../support/auth.ts';
import { setPassword, uniqueEmail } from '../support/db.ts';
import { latestEmailTo, linkIn } from '../support/mailpit.ts';
import { carrierOf, linkStatus, setSiteSetting } from '../support/u7.ts';

/** A switched-on public link of tenant A's first site, created through the API. */
async function openLink(
  request: import('@playwright/test').APIRequestContext,
  w: World,
  mode: 'auto_approve' | 'approval_required',
): Promise<string> {
  const site = w.A.sites[0]?.id as string;
  const res = await request.post(`/api/t/${w.A.tenantId}/carriers/public-links`, {
    data: { siteId: site },
    headers: {
      Cookie: `rf_session=${w.A.users.dispatcher.sessionToken}`,
      Origin: process.env.APP_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 5173}`,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { slug } = (await res.json()) as { slug: string };
  const on = { tenantId: w.A.tenantId, siteId: site, by: w.A.users.tenant_admin.id };
  await setSiteSetting({ ...on, key: 'booking.public_link_enabled', value: true });
  await setSiteSetting({ ...on, key: 'booking.public_registration_mode', value: mode });
  return slug;
}

test.describe('CR-02 Register through a public link', () => {
  test('approval_required: the email link signs the carrier in and the warehouse shows pending', async ({
    page,
    request,
  }) => {
    const w = await seedWorld(request);
    const slug = await openLink(request, w, 'approval_required');
    const email = uniqueEmail('pending');

    await page.goto(`/r/${slug}`);
    await expect(page.getByText(/Tenant A .* · Site/)).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel('Company name').fill('Baltic Freight UAB');
    await page.getByLabel('Country').selectOption('LT');
    await page.getByLabel('Your name').fill('Rasa Jankauskiene');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.getByText('Check your email')).toBeVisible();

    const mail = await latestEmailTo(email);
    expect(mail.subject).toMatch(/^Confirm your registration with Tenant A /);
    const link = new URL(linkIn(mail.text, '/carrier-registration#'));
    await page.goto(`${link.pathname}${link.hash}`);
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}\/tenants$/);
    await expect(page.getByText('Registration pending')).toBeVisible();
    await expect(
      page.getByRole('row', { name: /^Tenant A / }).getByText('Waiting for approval'),
    ).toBeVisible();
    await expectAccessible(page);
    expect(await linkStatus(w.A.tenantId, (await carrierOf(email)) as string)).toBeNull();
  });

  test('auto_approve: the carrier can book at once', async ({ page, request }) => {
    const w = await seedWorld(request);
    const slug = await openLink(request, w, 'auto_approve');
    const email = uniqueEmail('auto');
    await page.goto(`/r/${slug}`);
    await page.getByLabel('Company name').fill('Auto Haulage');
    await page.getByLabel('Your name').fill('Ada Auto');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Register' }).click();
    const link = new URL(linkIn((await latestEmailTo(email)).text, '/carrier-registration#'));
    await page.goto(`${link.pathname}${link.hash}`);
    await expect(page.getByRole('row', { name: /^Tenant A / }).getByText('Can book')).toBeVisible();
    expect(await linkStatus(w.A.tenantId, (await carrierOf(email)) as string)).toBe('active');
  });

  test('a known email gets the same answer, a sign-in prompt, and joins its company', async ({
    page,
    request,
  }) => {
    const w = await seedWorld(request);
    const slug = await openLink(request, w, 'auto_approve');
    const known = w.B.users.carrier_admin;
    await setPassword(known.id, 'known password 1');

    await page.goto(`/r/${slug}`);
    await page.getByLabel('Company name').fill('Some Other Name');
    await page.getByLabel('Your name').fill('Known Person');
    await page.getByLabel('Email').fill(known.email);
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.getByText('Check your email')).toBeVisible();

    const mail = await latestEmailTo(known.email);
    expect(mail.subject).toMatch(/^Sign in to finish your registration with Tenant A /);
    const link = new URL(linkIn(mail.text, '/carrier-registration#'));
    await page.goto(`${link.pathname}${link.hash}`);
    await expect(page.getByText('This email already has an account.')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('known password 1');
    await page.getByRole('button', { name: 'Sign in and confirm' }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${w.B.carrierId}/tenants$`));
    expect(await linkStatus(w.A.tenantId, w.B.carrierId)).toBe('active');
  });
});
