import { networkInterfaces } from 'node:os';
import { expect, test } from '@playwright/test';
import { SignupIssue, SignupStatus } from '../../packages/shared/src/modules/core/values.ts';
import { ErrorCode } from '../../packages/shared/src/values/index.ts';
import { expectAccessible } from '../support/auth.ts';
import { accountAndTenant, signupsOf } from '../support/db.ts';
import { latestEmailTo, linkIn } from '../support/mailpit.ts';
import { fillSignup, ownClientAddress, registration } from '../support/signup.ts';

test.describe('RG-01 Register a company', () => {
  test('LAN HTTP explains the secure-context requirement and offers localhost recovery', async ({
    page,
    baseURL,
  }) => {
    const address = Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;
    expect(address, 'the container exposes a LAN interface').toBeTruthy();
    const lan = new URL('/signup', baseURL);
    lan.hostname = address ?? '';
    await page.goto(lan.href);
    expect(await page.evaluate('isSecureContext')).toBe(false);
    expect(await page.evaluate(() => typeof crypto.subtle)).toBe('undefined');
    // The proxy works; the widget's secure-context restriction caused the original failure.
    expect(
      (await page.request.get(new URL('/api/public/signups/challenge', lan).href)).status(),
    ).toBe(200);
    await expect(page.getByText('Use a secure connection to register')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register company' })).toBeDisabled();
    await expectAccessible(page);
    await page.getByRole('link', { name: 'Open registration on localhost' }).click();
    expect(await page.evaluate('isSecureContext')).toBe(true);
    await fillSignup(page, registration('rg01-lan-recovery'));
    await page.getByRole('button', { name: 'Register company' }).click();
    await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 20_000 });
  });

  test('a solved proof expires in the UI and submit solves a fresh challenge', async ({ page }) => {
    await ownClientAddress(page);
    await page.clock.install();
    await page.goto('/signup');
    const r = registration('rg01-expired');
    await fillSignup(page, r);
    await page.getByRole('checkbox', { name: 'Automatic check against bots' }).click();
    await expect(page.locator('altcha-widget').getByText('Checked', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    const oldPayload = await page.locator('input[name="altcha"]').inputValue();
    await page.clock.fastForward(11 * 60_000);
    await expect(page.getByText('The check expired. Try again.')).toBeVisible();
    await expect(page.locator('input[name="altcha"]')).toHaveValue('');
    expect(await signupsOf(r.email)).toEqual([]);
    await page.clock.setSystemTime(new Date());
    const freshChallenge = page.waitForResponse('**/api/public/signups/challenge');
    const posted = page.waitForRequest(
      (req) => req.url().endsWith('/api/public/signups') && req.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Register company' }).click();
    expect((await freshChallenge).status()).toBe(200);
    expect((await posted).postDataJSON().altcha).not.toBe(oldPayload);
    await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 20_000 });
    expect(await signupsOf(r.email)).toHaveLength(1);
  });

  test('a challenge fetch failure shows a translated error and can be retried', async ({
    page,
  }) => {
    await ownClientAddress(page);
    await page.route('**/api/public/signups/challenge', (route) => route.abort(), { times: 1 });
    await page.goto('/signup');
    const r = registration('rg01-retry');
    await fillSignup(page, r);
    await page.getByRole('button', { name: 'Register company' }).click();
    await expect(page.getByText('The check failed. Try again.')).toBeVisible();
    expect(await signupsOf(r.email)).toEqual([]);
    await page.getByRole('button', { name: 'Register company' }).click();
    await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 20_000 });
    expect(await signupsOf(r.email)).toHaveLength(1);
  });

  test('an API-rejected proof shows its field error and the next submit retries', async ({
    page,
  }) => {
    await ownClientAddress(page);
    await page.route(
      '**/api/public/signups',
      (route) =>
        route.fulfill({
          status: 422,
          json: {
            error: {
              code: ErrorCode.validation_failed,
              message: 'Invalid json',
              details: { issues: [{ path: ['altcha'], code: SignupIssue.altcha_failed }] },
            },
          },
        }),
      { times: 1 },
    );
    await page.goto('/signup');
    const r = registration('rg01-rejected');
    await fillSignup(page, r);
    await page.getByRole('button', { name: 'Register company' }).click();
    await expect(page.getByText('The automatic check failed. Send the form again.')).toBeVisible({
      timeout: 20_000,
    });
    expect(await signupsOf(r.email)).toEqual([]);
    await page.getByRole('button', { name: 'Register company' }).click();
    await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 20_000 });
    expect(await signupsOf(r.email)).toHaveLength(1);
  });

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
      .poll(async () => linkIn((await latestEmailTo(r.email)).text, '/signup/verify#'), {
        timeout: 20_000,
      })
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
