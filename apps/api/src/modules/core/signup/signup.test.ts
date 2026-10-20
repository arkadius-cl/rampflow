import { randomUUID } from 'node:crypto';
import {
  SignupIssue,
  SignupStatus,
  TaxIdCheck,
  TaxIdType,
} from '@rampflow/shared/modules/core/values';
import { EmailTemplate, ErrorCode, StaffLocale, TokenPurpose } from '@rampflow/shared/values';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { tenantSignup } from '../schema.signup.ts';
import { appUser, org } from '../schema.ts';
import { signupEmail, signupForm, solvedAltcha } from './fixtures.ts';

// RG-01 and RG-03 against Postgres: the registration request, its 422s, the generic 202, the
// silent rate limits, the known-email path and superseding (design decision 5).

// Each test sends its own client address in X-Forwarded-For, so `signup_ip` counts per test.
const previousTrustProxy = vi.hoisted(() => {
  const previous = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = '1';
  return previous;
});
afterAll(() => {
  if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = previousTrustProxy;
});

const clock = testClock(new Date());
const app = createApp({ clock });
const anon = as(app, null);
const HOUR = 60 * 60_000;

const newIp = () => `198.51.100.${Math.floor(Math.random() * 250)}-${randomUUID()}`;

const post = (body: unknown, ip = newIp()) =>
  anon.post('/api/public/signups', { body, headers: { 'X-Forwarded-For': ip } });

/** A valid registration of `email` with a challenge solved now. */
async function register(email: string, o: { ip?: string; extra?: object } = {}) {
  const body = { ...signupForm(email), altcha: await solvedAltcha(clock.now()), ...o.extra };
  return post(body, o.ip);
}

const rowsOf = (email: string) =>
  ownerDb().select().from(tenantSignup).where(eq(tenantSignup.email, email));
const mailsTo = (email: string) =>
  ownerDb().select().from(outboxMessage).where(eq(outboxMessage.toEmail, email));

async function issuesOf(res: Response) {
  const json = (await res.json()) as {
    error: { code: string; details: { issues: { path: string[]; code: string }[] } };
  };
  expect(json.error.code).toBe(ErrorCode.validation_failed);
  return json.error.details.issues.map(({ path, code }) => ({ path, code }));
}

async function expectNothingWritten(email: string) {
  expect(await rowsOf(email)).toEqual([]);
  expect(await mailsTo(email)).toEqual([]);
}

let w: World;
beforeAll(async () => {
  w = await world();
});

describe('RG-01 a new email', () => {
  it('stores one pending registration and enqueues one verification email, nothing else', async () => {
    const email = signupEmail();
    const companyName = `Nordhafen Kühllogistik ${randomUUID().slice(0, 8)} GmbH`;
    const res = await register(email, { extra: { companyName, salutation: null } });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');

    const [row, ...more] = await rowsOf(email);
    expect(more).toEqual([]);
    expect(row).toMatchObject({
      status: SignupStatus.pending_email,
      companyName,
      givenName: 'Jonas',
      familyName: 'Petersen',
      salutation: null,
      taxIdValue: 'DE13669597600001',
      locale: StaffLocale.de,
    });
    expect(row?.passwordHash).toMatch(/^scrypt/);
    expect(row?.expiresAt.getTime()).toBe(clock.now().getTime() + 24 * HOUR);

    const mails = await mailsTo(email);
    expect(mails.map((m) => [m.template, m.locale])).toEqual([
      [EmailTemplate.core_signup_verify, StaffLocale.de],
    ]);
    expect(await ownerDb().select().from(org).where(eq(org.name, companyName))).toEqual([]);
    expect(await ownerDb().select().from(appUser).where(eq(appUser.email, email))).toEqual([]);

    // No token at rest: neither the row nor the payload holds the token or a link.
    const token = deriveToken(TokenPurpose.signup, row?.id ?? '');
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(mails[0]?.payload)).not.toContain(token);
    expect(JSON.stringify(mails[0]?.payload)).not.toMatch(/https?:|signup\/verify/);
  });

  it('writes the verification email in the page language', async () => {
    const email = signupEmail('pl');
    expect((await register(email, { extra: { locale: StaffLocale.pl } })).status).toBe(202);
    expect((await mailsTo(email)).map((m) => m.locale)).toEqual([StaffLocale.pl]);
  });
});

describe('RG-03 a known email', () => {
  it('writes no registration and sends the "you already have an account" email', async () => {
    const email = w.A.users.carrier_admin.email;
    const res = await register(email);
    expect(res.status).toBe(202);
    expect(await rowsOf(email)).toEqual([]);
    const mails = await mailsTo(email);
    expect(mails.map((m) => m.template)).toEqual([EmailTemplate.core_signup_known_account]);
    expect(JSON.stringify(mails[0]?.payload)).not.toContain('Nordhafen');
  });

  it('answers a known and a new email alike', async () => {
    const known = await register(w.B.users.tenant_admin.email);
    const fresh = await register(signupEmail());
    expect([known.status, await known.text()]).toEqual([fresh.status, await fresh.text()]);
    expect(known.status).toBe(202);
  });
});

describe('RG-01 superseding', () => {
  it('a second registration within the hour supersedes the first', async () => {
    const email = signupEmail('twice');
    expect((await register(email)).status).toBe(202);
    const [first] = await rowsOf(email);
    expect((await register(email)).status).toBe(202);
    const rows = await rowsOf(email);
    expect(rows.find((r) => r.id === first?.id)?.status).toBe(SignupStatus.superseded);
    expect(rows.filter((r) => r.status === SignupStatus.pending_email)).toHaveLength(1);
    expect(await mailsTo(email)).toHaveLength(2);
  });

  it('registering again 25 hours later supersedes the expired one', async () => {
    const email = signupEmail('later');
    expect((await register(email)).status).toBe(202);
    const [first] = await rowsOf(email);
    clock.advance(25 * HOUR);
    expect((await register(email)).status).toBe(202);
    const rows = await rowsOf(email);
    expect(rows.find((r) => r.id === first?.id)?.status).toBe(SignupStatus.superseded);
    expect(rows.find((r) => r.id !== first?.id)?.status).toBe(SignupStatus.pending_email);
  });
});

describe('RG-01 field rules and abuse checks answer 422 and write nothing', () => {
  it('refuses a 9-character password at password', async () => {
    const email = signupEmail();
    const res = await register(email, { extra: { password: '123456789' } });
    expect(res.status).toBe(422);
    expect((await issuesOf(res)).map((i) => i.path)).toEqual([['password']]);
    await expectNothingWritten(email);
  });

  it('refuses a country outside the EU at country', async () => {
    const email = signupEmail();
    const res = await register(email, { extra: { country: 'CH' } });
    expect(res.status).toBe(422);
    expect((await issuesOf(res)).map((i) => i.path)).toEqual([['country']]);
    await expectNothingWritten(email);
  });

  it('refuses a tax id with a wrong check digit with its code', async () => {
    const email = signupEmail();
    const res = await register(email, {
      extra: { taxIdType: TaxIdType.eu_vat, taxIdValue: 'DE136695977' },
    });
    expect(res.status).toBe(422);
    expect(await issuesOf(res)).toEqual([
      { path: ['taxIdValue'], code: TaxIdCheck.tax_id_checksum },
    ]);
    await expectNothingWritten(email);
  });

  it('refuses a missing proof of work at altcha', async () => {
    const email = signupEmail();
    const res = await post(signupForm(email));
    expect(res.status).toBe(422);
    expect((await issuesOf(res)).map((i) => i.path)).toEqual([['altcha']]);
    await expectNothingWritten(email);
  });

  it('accepts a solved challenge once; the second use answers 422 at altcha', async () => {
    const email = signupEmail();
    const body = { ...signupForm(email), altcha: await solvedAltcha(clock.now()) };
    expect((await post(body)).status).toBe(202);
    const again = await post(body);
    expect(again.status).toBe(422);
    expect(await issuesOf(again)).toEqual([{ path: ['altcha'], code: SignupIssue.altcha_failed }]);
    expect(await mailsTo(email)).toHaveLength(1);
    expect(await rowsOf(email)).toHaveLength(1);
  });

  it('refuses a challenge issued 11 minutes earlier', async () => {
    const email = signupEmail();
    const altcha = await solvedAltcha(new Date(clock.now().getTime() - 11 * 60_000));
    const res = await post({ ...signupForm(email), altcha });
    expect(res.status).toBe(422);
    expect(await issuesOf(res)).toEqual([{ path: ['altcha'], code: SignupIssue.altcha_failed }]);
    await expectNothingWritten(email);
  });

  it('refuses a disposable domain and its subdomains at email', async () => {
    for (const email of [
      `ops-${randomUUID()}@mailinator.com`,
      `ops-${randomUUID()}@eu.mailinator.com`,
    ]) {
      const res = await register(email);
      expect(res.status).toBe(422);
      expect(await issuesOf(res)).toEqual([
        { path: ['email'], code: SignupIssue.disposable_email },
      ]);
      await expectNothingWritten(email);
    }
  });
});

describe('RG-01 rate limits answer the same 202 and write nothing', () => {
  it('the fourth registration of one email within the hour', async () => {
    const email = signupEmail('four');
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await register(email)).status);
    expect(statuses).toEqual([202, 202, 202, 202]);
    expect(await rowsOf(email)).toHaveLength(3);
    expect(await mailsTo(email)).toHaveLength(3);
  });

  it('the 21st registration from one client address', { timeout: 120_000 }, async () => {
    const ip = newIp();
    const emails = Array.from({ length: 21 }, () => signupEmail('mass'));
    for (const email of emails.slice(0, 20))
      expect((await register(email, { ip })).status).toBe(202);
    const last = emails[20] ?? '';
    expect((await register(last, { ip })).status).toBe(202);
    await expectNothingWritten(last);
    expect(await rowsOf(emails[19] ?? '')).toHaveLength(1);
  });
});
