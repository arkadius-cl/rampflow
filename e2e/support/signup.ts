import { randomBytes, randomInt } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { EuCountry, Salutation, TaxIdType } from '../../packages/shared/src/modules/core/values.ts';
import { latestEmailTo, linkIn } from './mailpit.ts';

// RG-01 to RG-05: the registration form in English, and its emailed link.

export interface Registration {
  salutation?: Salutation;
  givenName: string;
  familyName: string;
  email: string;
  password: string;
  companyName: string;
  country: EuCountry;
  taxIdType: TaxIdType;
  taxIdValue: string;
}

/**
 * An address on a domain of its own: duplicate detection counts other tenants' members at the
 * same domain, so a shared test domain would flag every registration after the first.
 */
export const signupEmail = (label: string) => `${label}@${randomBytes(4).toString('hex')}.e2e.test`;

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];

/** A Polish NIP with a valid check digit, unlikely to repeat across runs. */
export function randomNip(): string {
  for (;;) {
    const head = Array.from({ length: 9 }, (_, i) => (i === 0 ? randomInt(1, 10) : randomInt(10)));
    const check = NIP_WEIGHTS.reduce((sum, w, i) => sum + w * (head[i] ?? 0), 0) % 11;
    if (check < 10) return `${head.join('')}${check}`;
  }
}

/** A fresh registration of a Polish company with its NIP. */
export const registration = (label: string, over: Partial<Registration> = {}): Registration => ({
  givenName: 'Jonas',
  familyName: 'Petersen',
  email: signupEmail(label),
  password: 'rampflow-e2e-signup',
  companyName: `${label} ${randomBytes(3).toString('hex')} Sp. z o.o.`,
  country: EuCountry.PL,
  taxIdType: TaxIdType.pl_nip,
  taxIdValue: randomNip(),
  ...over,
});

/**
 * Gives the page a client address of its own: `signup_ip` allows 20 registrations per hour and
 * address, and every spec of the run would otherwise share one.
 */
export async function ownClientAddress(page: Page): Promise<void> {
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': ip });
}

/** Fills the /signup form of the current page in English. */
export async function fillSignup(page: Page, r: Registration): Promise<void> {
  if (r.salutation) {
    await page.getByRole('radio', { name: r.salutation === Salutation.mr ? 'Mr' : 'Ms' }).check();
  }
  await page.getByLabel('First name').fill(r.givenName);
  await page.getByLabel('Last name').fill(r.familyName);
  await page.getByLabel('Work email').fill(r.email);
  await page.getByLabel('Password').fill(r.password);
  await page.getByLabel('Company name').fill(r.companyName);
  await page.getByLabel('Country').selectOption(r.country);
  await page.getByLabel('Type of tax number').selectOption(r.taxIdType);
  await page.getByLabel('Tax number', { exact: true }).fill(r.taxIdValue);
}

/** Opens /signup, registers and waits for "Check your inbox". */
export async function register(page: Page, r: Registration): Promise<void> {
  await page.goto('/signup');
  await fillSignup(page, r);
  await page.getByRole('button', { name: 'Register company' }).click();
  await expect(page.getByText('Check your inbox')).toBeVisible({ timeout: 20_000 });
}

/** The `/signup/verify#<token>` link of the newest email to `email`. */
export async function verificationLink(email: string): Promise<string> {
  const mail = await latestEmailTo(email);
  return linkIn(mail.text, '/signup/verify#');
}
