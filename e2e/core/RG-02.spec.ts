import { expect, test } from '@playwright/test';
import { SignupStatus } from '../../packages/shared/src/modules/core/values.ts';
import { expectAccessible, signInWithPassword } from '../support/auth.ts';
import { accountAndTenant, createAccount, signupsOf } from '../support/db.ts';
import { ownClientAddress, register, registration, verificationLink } from '../support/signup.ts';

test.describe('RG-02 Confirm the registration and create the company', () => {
  test('the emailed link shows the registration, creates it on click and works once', async ({
    page,
    browser,
  }) => {
    await ownClientAddress(page);
    const r = registration('rg02');
    await register(page, r);
    const link = await verificationLink(r.email);

    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Create your company' })).toBeVisible();
    await expect(page.getByText(r.email)).toBeVisible();
    await expect(page.getByText(r.companyName)).toBeVisible();
    await expect(page.getByText('Your company may already use rampflow.')).toHaveCount(0);
    await expectAccessible(page);
    expect(await accountAndTenant(r.email, r.companyName)).toEqual({ users: 0, orgs: 0 });
    expect((await signupsOf(r.email))[0]?.status).toBe(SignupStatus.pending_email);

    await page.getByRole('button', { name: 'Create company', exact: true }).click();
    await expect(page).toHaveURL(/\/t\/[0-9a-f-]{36}$/);
    const tenantId = new URL(page.url()).pathname.split('/')[2];
    const [row] = await signupsOf(r.email);
    expect(row).toMatchObject({ status: SignupStatus.verified, tenant_id: tenantId });
    await page.getByTestId('org-switcher').click();
    const orgs = page.getByRole('menuitem');
    await expect(orgs).toHaveCount(1);
    await expect(orgs).toContainText(r.companyName);
    await page.keyboard.press('Escape');

    await page.goto(link);
    await expect(page.getByText('This link no longer works')).toBeVisible();
    await page.getByRole('link', { name: 'Register again' }).click();
    await expect(page).toHaveURL(/\/signup$/);
    expect(await accountAndTenant(r.email, r.companyName)).toEqual({ users: 1, orgs: 1 });

    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await signInWithPassword(other, r.email, r.password);
    await expect(other).toHaveURL(new RegExp(`/t/${tenantId}`));
    await fresh.close();
  });

  test('an account created before the click blocks it and points to sign-in', async ({ page }) => {
    await ownClientAddress(page);
    const r = registration('rg02-exists');
    await register(page, r);
    const link = await verificationLink(r.email);
    await createAccount(r.email, 'rampflow-e2e-other');

    await page.goto(link);
    await page.getByRole('button', { name: 'Create company', exact: true }).click();
    await expect(page.getByText('You already have an account')).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await signupsOf(r.email))[0]?.status).toBe(SignupStatus.pending_email);
    expect(await accountAndTenant(r.email, r.companyName)).toEqual({ users: 1, orgs: 0 });
  });
});
