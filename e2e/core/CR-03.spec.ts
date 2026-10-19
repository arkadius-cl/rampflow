import { expect, test } from '@playwright/test';
import { expectAccessible, seedWorld, signInWithPassword } from '../support/auth.ts';
import { setPassword } from '../support/db.ts';
import { latestEmailTo, linkIn } from '../support/mailpit.ts';

test.describe('CR-03 Sign in', () => {
  test('a carrier user signs in by password and lands in the carrier shell', async ({
    page,
    request,
  }) => {
    const w = await seedWorld(request);
    const user = w.A.users.carrier_user;
    await setPassword(user.id, 'carrier password 1');

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in to rampflow' })).toBeVisible();
    await expectAccessible(page);

    await signInWithPassword(page, user.email, 'wrong password 99');
    await expect(page.getByText('Wrong email or password.')).toBeVisible();

    await page.getByLabel('Password', { exact: true }).fill('carrier password 1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${w.A.carrierId}$`));
    await expect(page.getByTestId('org-switcher')).toContainText('Carrier A');
    await expectAccessible(page);
  });

  test('a magic link signs in once', async ({ page, request, browser }) => {
    const w = await seedWorld(request);
    const user = w.A.users.carrier_admin;

    await page.goto('/login');
    await page.getByRole('link', { name: 'Email me a sign-in link' }).click();
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Send sign-in link' }).click();
    await expect(page.getByText('Check your inbox')).toBeVisible();

    const email = await latestEmailTo(user.email);
    expect(email.subject).toBe('Your sign-in link for rampflow');
    const link = linkIn(email.text, '/auth/magic#');
    const path = new URL(link).pathname + new URL(link).hash;

    const fresh = await browser.newContext();
    const tab = await fresh.newPage();
    await tab.goto(path);
    await expect(tab).toHaveURL(new RegExp(`/c/${w.A.carrierId}$`));
    await fresh.close();

    const again = await browser.newContext();
    const second = await again.newPage();
    await second.goto(path);
    await expect(second.getByText('This link no longer works')).toBeVisible();
    await again.close();
  });

  test('a password reset sets the new password and ends every other session', async ({
    page,
    request,
    browser,
  }) => {
    const w = await seedWorld(request);
    const user = w.A.users.dispatcher;
    await setPassword(user.id, 'old password 123');

    const laptop = await browser.newContext();
    await signInWithPassword(await laptop.newPage(), user.email, 'old password 123');
    await expect.poll(async () => (await laptop.request.get('/api/me')).status()).toBe(200);

    await page.goto('/login?mode=reset');
    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('Check your inbox')).toBeVisible();

    const link = linkIn((await latestEmailTo(user.email)).text, '/auth/reset#');
    await page.goto(new URL(link).pathname + new URL(link).hash);
    await expect(page).toHaveURL(/\/auth\/reset$/);
    await page.getByLabel('New password').fill('new password 456');
    await page.getByLabel('Repeat the password').fill('new password 456');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${w.A.tenantId}`));

    expect((await laptop.request.get('/api/me')).status()).toBe(401);
    await laptop.close();

    const later = await browser.newContext();
    const tab = await later.newPage();
    await signInWithPassword(tab, user.email, 'new password 456');
    await expect(tab).toHaveURL(new RegExp(`/t/${w.A.tenantId}`));
    await later.close();
  });
});
