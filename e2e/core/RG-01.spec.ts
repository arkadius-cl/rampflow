import { expect, test } from '@playwright/test';
import { SignupStatus } from '../../packages/shared/src/modules/core/values.ts';
import { expectAccessible } from '../support/auth.ts';
import { accountAndTenant, signupsOf } from '../support/db.ts';
import { latestEmailTo, linkIn } from '../support/mailpit.ts';
import { fillSignup, ownClientAddress, registration } from '../support/signup.ts';

test.describe('RG-01 Register a company', () => {
  test('the form registers with a local proof of work, no cookie and no third-party request', async ({
    page,
    context,
    baseURL,
  }) => {
    await ownClientAddress(page);
    const origin = new URL(baseURL ?? '').origin;
    const requests: string[] = [];
    const setCookies: string[] = [];
    page.on('request', (req) => requests.push(req.url()));
    page.on('response', async (res) => {
      const cookie = await res.headerValue('set-cookie');
      if (cookie) setCookies.push(`${res.url()}: ${cookie}`);
    });

    await page.goto('/login');
    await page.getByRole('link', { name: 'Register your company' }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole('heading', { name: 'Register your company' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'No answer' })).toBeChecked();
    await expectAccessible(page);

    const r = registration('rg01');
    await fillSignup(page, r);
    expect(await page.evaluate('document.cookie')).toBe('');
    await page.getByRole('button', { name: 'Register company' }).click();
    await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(r.email)).toBeVisible();

    const challenge = requests.filter((url) => url.endsWith('/api/public/signups/challenge'));
    expect(challenge, 'the widget fetched its challenge from our API').toHaveLength(1);
    const foreign = requests.filter(
      (url) =>
        !url.startsWith(`${origin}/`) && !url.startsWith('blob:') && !url.startsWith('data:'),
    );
    expect(foreign, 'every request goes to the app origin').toEqual([]);
    expect(setCookies, 'no response sets a cookie').toEqual([]);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate('document.cookie')).toBe('');

    const [row, ...older] = await signupsOf(r.email);
    expect(row?.status).toBe(SignupStatus.pending_email);
    expect(older).toEqual([]);
    expect(await accountAndTenant(r.email, r.companyName)).toEqual({ users: 0, orgs: 0 });
    const mail = await latestEmailTo(r.email);
    expect(mail.subject).toBe(`Confirm the registration of ${r.companyName} on rampflow`);
    expect(mail.text).toContain('Hello Jonas Petersen,');
    const firstLink = linkIn(mail.text, '/signup/verify#');

    await page.getByRole('button', { name: 'Send again' }).click();
    await expect(page.getByText('Sent again. Only the newest link works.')).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(async () => (await signupsOf(r.email)).map((s) => s.status))
      .toEqual([SignupStatus.pending_email, SignupStatus.superseded]);
    await expect
      .poll(async () => linkIn((await latestEmailTo(r.email)).text, '/signup/verify#'))
      .not.toBe(firstLink);
    await expectAccessible(page);
  });

  test('the verification email is in the page language', async ({ page }) => {
    await ownClientAddress(page);
    const r = registration('rg01-de');
    await page.goto('/signup');
    await fillSignup(page, r);
    await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Unternehmen registrieren' }).click();
    await expect(page.getByText('Sehen Sie in Ihr Postfach')).toBeVisible({ timeout: 20_000 });

    const mail = await latestEmailTo(r.email);
    expect(mail.subject).toBe(`Bestätigen Sie die Registrierung von ${r.companyName} bei rampflow`);
    expect(mail.text).toContain('Guten Tag Jonas Petersen,');
  });

  test('a disposable address shows its field error and registers nothing', async ({ page }) => {
    await ownClientAddress(page);
    const r = registration('rg01-disposable', { email: `ops-${Date.now()}@mailinator.com` });
    await page.goto('/signup');
    await fillSignup(page, r);
    await page.getByRole('button', { name: 'Register company' }).click();
    await expect(
      page.getByText('Disposable email addresses are not accepted. Use your work address.'),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Work email')).toHaveAttribute('aria-invalid', 'true');
    expect(await signupsOf(r.email)).toEqual([]);

    // The form solves a fresh challenge for the next attempt, so a corrected address goes through.
    const fixed = registration('rg01-fixed');
    await page.getByLabel('Work email').fill(fixed.email);
    await page.getByRole('button', { name: 'Register company' }).click();
    await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 20_000 });
    expect(await signupsOf(fixed.email)).toHaveLength(1);
  });
});
