import { randomUUID } from 'node:crypto';
import { tenantStatus } from '@rampflow/shared/modules/core/tenant-status';
import {
  EuCountry,
  Salutation,
  SignupIssue,
  SignupStatus,
  TaxIdCheck,
  TaxIdStatus,
  TaxIdType,
  TenantStatus,
} from '@rampflow/shared/modules/core/values';
import {
  ConflictReason,
  EmailTemplate,
  ErrorCode,
  OrgKind,
  PackageId,
  Role,
  ScopeParty,
  StaffLocale,
  TokenPurpose,
} from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import type { MembershipId, TenantId } from '../../../db/ids.ts';
import { withScope } from '../../../db/scope.ts';
import { testClock } from '../../../kernel/clock.ts';
import { SESSION_COOKIE } from '../../../kernel/scopes.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import { openLinkFor } from '../../booking/carriers/fixtures.ts';
import { driverHarness } from '../../driver/session/fixtures.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { account } from '../auth/fixtures.ts';
import { type SignupId, tenantSignup } from '../schema.signup.ts';
import { appUser, membership, org, tenantSubscription } from '../schema.ts';
import { possibleDuplicate } from './duplicates.redeem.ts';
import {
  pendingSignup,
  SIGNUP_COMPANY,
  SIGNUP_PASSWORD,
  signupEmail,
  signupForm,
  solvedAltcha,
} from './fixtures.ts';

// RG-01 to RG-04 against Postgres: the registration request, its 422s, the generic 202, the
// silent rate limits, the known-email path and superseding (design decision 5), then inspect,
// verify and the duplicate check (decisions 9 and 10).

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

  it('makes the page language the language of the verified account', async () => {
    const email = signupEmail('pl-verify');
    expect((await register(email, { extra: { locale: StaffLocale.pl } })).status).toBe(202);
    // A tax id of its own, so the tenant it creates is no duplicate for the tests below.
    await ownerDb()
      .update(tenantSignup)
      .set({ taxIdType: TaxIdType.eu_vat, taxIdValue: uniqueVat() })
      .where(eq(tenantSignup.email, email));
    const [row] = await rowsOf(email);
    expect((await verify(deriveToken(TokenPurpose.signup, row?.id ?? ''))).status).toBe(200);
    expect((await usersWith(email)).map((u) => u.locale)).toEqual([StaffLocale.pl]);
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

  it("writes it in the account's language, else in the page's", async () => {
    const polish = await account(ownerDb(), { email: signupEmail('known-pl') });
    await ownerDb()
      .update(appUser)
      .set({ locale: StaffLocale.pl })
      .where(eq(appUser.id, polish.id));
    const silent = await account(ownerDb(), { email: signupEmail('known-none') });
    await ownerDb().update(appUser).set({ locale: null }).where(eq(appUser.id, silent.id));
    for (const a of [polish, silent]) {
      expect((await register(a.email, { extra: { locale: StaffLocale.de } })).status).toBe(202);
    }
    const sent = async (email: string) =>
      (await mailsTo(email)).map((m) => [m.template, m.locale, m.payload]);
    expect(await sent(polish.email)).toEqual([
      [EmailTemplate.core_signup_known_account, StaffLocale.pl, { locale: StaffLocale.pl }],
    ]);
    expect(await sent(silent.email)).toEqual([
      [EmailTemplate.core_signup_known_account, StaffLocale.de, { locale: StaffLocale.de }],
    ]);
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

// RG-02 and RG-04: inspect, verify, duplicates (design decisions 9 and 10).

const randomDigits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
/** A German VAT number no other test uses; the org table does not check its digit. */
const uniqueVat = () => `DE9${randomDigits(8)}`;

const inspect = (token: string) => anon.post('/api/public/signups/inspect', { body: { token } });
const verify = (token: string) => anon.post('/api/public/signups/verify', { body: { token } });

const signupRow = async (id: SignupId) =>
  (await ownerDb().select().from(tenantSignup).where(eq(tenantSignup.id, id)))[0];
const usersWith = (email: string) =>
  ownerDb().select().from(appUser).where(eq(appUser.email, email));
const tenantsNamed = (name: string) =>
  ownerDb()
    .select()
    .from(org)
    .where(and(eq(org.kind, OrgKind.tenant), eq(org.name, name)));

/** A tenant org with `taxId` and, optionally, a member at `memberEmail`. */
async function otherTenant(o: {
  taxId?: { type: TaxIdType; value: string };
  memberEmail?: string;
}) {
  const tenantId = randomUUID() as TenantId;
  await ownerDb()
    .insert(org)
    .values({
      id: tenantId,
      kind: OrgKind.tenant,
      name: `Other ${tenantId.slice(0, 8)}`,
      ...(o.taxId
        ? {
            taxIdType: o.taxId.type,
            taxIdValue: o.taxId.value,
            taxIdStatus: TaxIdStatus.unverified,
          }
        : {}),
    });
  if (o.memberEmail) {
    const member = await account(ownerDb(), { email: o.memberEmail });
    await ownerDb()
      .insert(membership)
      .values({
        id: randomUUID() as MembershipId,
        userId: member.id,
        orgId: tenantId,
        orgKind: OrgKind.tenant,
        role: Role.dispatcher,
      });
  }
  return tenantId;
}

const isDuplicate = (signup: Parameters<typeof possibleDuplicate>[1]) =>
  withScope({ party: ScopeParty.anonymous }, (tx) => possibleDuplicate(tx, signup));

describe('RG-04 possible duplicates', () => {
  const newSignup = (o: { email?: string; type?: TaxIdType; value?: string }) => ({
    email: o.email ?? signupEmail('dup'),
    taxIdType: o.type ?? TaxIdType.eu_vat,
    taxIdValue: o.value ?? uniqueVat(),
    tenantId: null,
  });

  it('counts another tenant with the same VAT number', async () => {
    const vat = uniqueVat();
    await otherTenant({ taxId: { type: TaxIdType.eu_vat, value: vat } });
    expect(await isDuplicate(newSignup({ value: vat }))).toBe(true);
    expect(await isDuplicate(newSignup({}))).toBe(false);
  });

  it('counts equivalent tax ids: a NIP and its PL VAT number, a W-IdNr and its VAT number', async () => {
    const nip = randomDigits(10);
    await otherTenant({ taxId: { type: TaxIdType.pl_nip, value: nip } });
    expect(await isDuplicate(newSignup({ value: `PL${nip}` }))).toBe(true);

    const vat = uniqueVat();
    await otherTenant({ taxId: { type: TaxIdType.de_stn, value: `${vat}00002` } });
    expect(await isDuplicate(newSignup({ value: vat }))).toBe(true);
    expect(await isDuplicate(newSignup({ type: TaxIdType.de_stn, value: `${vat}00001` }))).toBe(
      true,
    );
  });

  it("counts another tenant's member at the same company domain", async () => {
    const domain = `${randomUUID().slice(0, 8)}.acme.example`;
    await otherTenant({ memberEmail: `dispatch@${domain}` });
    expect(await isDuplicate(newSignup({ email: `ops@${domain}` }))).toBe(true);
    expect(await isDuplicate(newSignup({ email: `ops@other-${domain}` }))).toBe(false);
  });

  it('does not count a free-mail domain', async () => {
    await otherTenant({ memberEmail: `dispatch-${randomUUID()}@gmail.com` });
    expect(await isDuplicate(newSignup({ email: `ops-${randomUUID()}@gmail.com` }))).toBe(false);
  });

  it('never counts the tenant the registration created', async () => {
    const vat = uniqueVat();
    const tenantId = await otherTenant({ taxId: { type: TaxIdType.eu_vat, value: vat } });
    expect(await isDuplicate({ ...newSignup({ value: vat }), tenantId })).toBe(false);
  });
});

describe('RG-02 inspect', () => {
  it('shows email and company twice without using the link', async () => {
    const s = await pendingSignup(ownerDb(), { now: clock.now() });
    for (let i = 0; i < 2; i++) {
      const res = await inspect(s.token);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        email: s.email,
        companyName: SIGNUP_COMPANY,
        possibleDuplicate: false,
      });
    }
    expect((await signupRow(s.id))?.status).toBe(SignupStatus.pending_email);
    expect((await verify(s.token)).status).toBe(200);
  });

  it('answers 401 for a used, an expired and an unknown link', async () => {
    const used = await pendingSignup(ownerDb(), { now: clock.now() });
    expect((await verify(used.token)).status).toBe(200);
    expect((await inspect(used.token)).status).toBe(401);
    const expired = await pendingSignup(ownerDb(), {
      now: new Date(clock.now().getTime() - 25 * HOUR),
    });
    expect((await inspect(expired.token)).status).toBe(401);
    expect((await inspect(deriveToken(TokenPurpose.signup, randomUUID()))).status).toBe(401);
  });
});

describe('RG-02 verify', () => {
  it('creates the onboarding tenant, its start subscription, the verified admin, and signs in', async () => {
    const vat = uniqueVat();
    const email = signupEmail('verify');
    const s = await pendingSignup(ownerDb(), {
      now: clock.now(),
      email,
      taxId: { type: TaxIdType.eu_vat, value: vat },
      salutation: Salutation.mr,
    });
    const res = await verify(s.token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantId: TenantId; possibleDuplicate: boolean };
    expect(body.possibleDuplicate).toBe(false);
    expect(res.headers.getSetCookie().some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(true);

    const [tenant] = await ownerDb().select().from(org).where(eq(org.id, body.tenantId));
    expect(tenant).toMatchObject({
      kind: OrgKind.tenant,
      name: SIGNUP_COMPANY,
      country: EuCountry.DE,
      taxIdType: TaxIdType.eu_vat,
      taxIdValue: vat,
      taxIdStatus: TaxIdStatus.pending,
      taxIdCheckedAt: null,
      possibleDuplicate: false,
      activatedAt: null,
    });
    expect(tenantStatus({ activatedAt: tenant?.activatedAt ?? null })).toBe(
      TenantStatus.onboarding,
    );
    const [sub] = await ownerDb()
      .select()
      .from(tenantSubscription)
      .where(eq(tenantSubscription.tenantId, body.tenantId));
    expect(sub?.package).toBe(PackageId.start);

    const [user, ...others] = await usersWith(email);
    expect(others).toEqual([]);
    expect(user).toMatchObject({
      name: 'Jonas Petersen',
      givenName: 'Jonas',
      familyName: 'Petersen',
      salutation: Salutation.mr,
      locale: StaffLocale.de,
    });
    expect(user?.emailVerifiedAt).toEqual(clock.now());
    expect(sub?.updatedBy).toBe(user?.id);
    const members = await ownerDb()
      .select({ userId: membership.userId, role: membership.role })
      .from(membership)
      .where(eq(membership.orgId, body.tenantId));
    expect(members).toEqual([{ userId: user?.id, role: Role.tenant_admin }]);

    expect(await signupRow(s.id)).toMatchObject({
      status: SignupStatus.verified,
      verifiedAt: clock.now(),
      passwordHash: null,
      tenantId: body.tenantId,
      userId: user?.id,
    });

    const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';
    const me = await app.request('/api/me', { headers: { Cookie: cookie.split(';')[0] ?? '' } });
    expect(me.status).toBe(200);
    expect(JSON.stringify(await me.json())).toContain(email);

    const login = await anon.post('/api/auth/login', {
      body: { email, password: SIGNUP_PASSWORD },
      headers: { 'X-Forwarded-For': newIp() },
    });
    expect(login.status).toBe(200);
  });

  it('gives a pl_nip tenant the status unverified', async () => {
    const s = await pendingSignup(ownerDb(), {
      now: clock.now(),
      taxId: { type: TaxIdType.pl_nip, value: randomDigits(10) },
    });
    const res = await verify(s.token);
    const { tenantId } = (await res.json()) as { tenantId: TenantId };
    const [tenant] = await ownerDb().select().from(org).where(eq(org.id, tenantId));
    expect(tenant?.taxIdStatus).toBe(TaxIdStatus.unverified);
  });

  it('flags a possible duplicate and still creates the tenant', async () => {
    const vat = uniqueVat();
    await otherTenant({ taxId: { type: TaxIdType.eu_vat, value: vat } });
    const s = await pendingSignup(ownerDb(), {
      now: clock.now(),
      taxId: { type: TaxIdType.eu_vat, value: vat },
    });
    const inspected = (await (await inspect(s.token)).json()) as { possibleDuplicate: boolean };
    expect(inspected.possibleDuplicate).toBe(true);
    const res = await verify(s.token);
    const text = await res.text();
    const body = JSON.parse(text) as { tenantId: TenantId; possibleDuplicate: boolean };
    expect(Object.keys(body).sort()).toEqual(['possibleDuplicate', 'tenantId']);
    expect(body.possibleDuplicate).toBe(true);
    const [tenant] = await ownerDb().select().from(org).where(eq(org.id, body.tenantId));
    expect(tenant?.possibleDuplicate).toBe(true);
  });

  it('works once: a second use answers 401 and exactly one tenant exists', async () => {
    const s = await pendingSignup(ownerDb(), { now: clock.now() });
    expect((await verify(s.token)).status).toBe(200);
    const second = await verify(s.token);
    expect(second.status).toBe(401);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe(
      ErrorCode.unauthorized,
    );
    expect(await usersWith(s.email)).toHaveLength(1);
    const row = await signupRow(s.id);
    expect(
      await ownerDb()
        .select()
        .from(org)
        .where(eq(org.id, row?.tenantId as never)),
    ).toHaveLength(1);
  });

  it('refuses a superseded link and one 24 hours and 1 minute old, creating nothing', async () => {
    const email = signupEmail('stale');
    const superseded = await pendingSignup(ownerDb(), { now: clock.now(), email });
    await ownerDb()
      .update(tenantSignup)
      .set({ status: SignupStatus.superseded })
      .where(eq(tenantSignup.id, superseded.id));
    expect((await verify(superseded.token)).status).toBe(401);

    const expired = await pendingSignup(ownerDb(), {
      now: new Date(clock.now().getTime() - 24 * HOUR - 60_000),
      email,
    });
    expect((await verify(expired.token)).status).toBe(401);
    expect(await usersWith(email)).toEqual([]);
    expect((await signupRow(expired.id))?.tenantId).toBeNull();
  });

  it('answers 409 account_exists for an account created in the meantime; the row stays pending', async () => {
    const companyName = `Nordhafen ${randomUUID().slice(0, 8)} GmbH`;
    const s = await pendingSignup(ownerDb(), { now: clock.now() });
    await ownerDb().update(tenantSignup).set({ companyName }).where(eq(tenantSignup.id, s.id));
    await account(ownerDb(), { email: s.email });
    const res = await verify(s.token);
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: { code: string; details: { reason: string } } };
    expect(json.error).toMatchObject({
      code: ErrorCode.conflict,
      details: { reason: ConflictReason.account_exists },
    });
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await signupRow(s.id)).toMatchObject({
      status: SignupStatus.pending_email,
      verifiedAt: null,
      tenantId: null,
    });
    expect((await signupRow(s.id))?.passwordHash).not.toBeNull();
    expect(await tenantsNamed(companyName)).toEqual([]);
  });

  it('two concurrent verifications on two connections: 200 and 401, one tenant, user and membership', async () => {
    const companyName = `Nordhafen ${randomUUID().slice(0, 8)} GmbH`;
    const s = await pendingSignup(ownerDb(), { now: clock.now() });
    await ownerDb().update(tenantSignup).set({ companyName }).where(eq(tenantSignup.id, s.id));
    const both = await Promise.all([verify(s.token), verify(s.token)]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 401]);
    const tenants = await tenantsNamed(companyName);
    expect(tenants).toHaveLength(1);
    const users = await usersWith(s.email);
    expect(users).toHaveLength(1);
    const members = await ownerDb()
      .select()
      .from(membership)
      .where(eq(membership.userId, users[0]?.id as never));
    expect(members.map((m) => m.orgId)).toEqual([tenants[0]?.id]);
  });
});

describe('tenant facts stay off the public link, carrier and driver answers', () => {
  it('carry no taxId*, possibleDuplicate or activatedAt field', async () => {
    const tw = await world();
    await ownerDb()
      .update(org)
      .set({
        taxIdType: TaxIdType.eu_vat,
        taxIdValue: 'DE136695976',
        taxIdStatus: TaxIdStatus.verified,
        taxIdCheckedAt: clock.now(),
        possibleDuplicate: true,
        activatedAt: clock.now(),
      })
      .where(eq(org.id, tw.A.tenantId));
    const leaks = (text: string) =>
      text.match(/\b(taxId\w*|possibleDuplicate|activatedAt)\b|DE136695976/g) ?? [];

    const slug = await openLinkFor(ownerDb(), {
      tenantId: tw.A.tenantId,
      siteId: tw.A.sites[0].id,
      by: tw.A.users.tenant_admin.id,
    });
    const link = await anon.get(`/api/public/links/${slug}`);
    expect(link.status).toBe(200);
    expect(leaks(await link.text())).toEqual([]);

    const tenants = await as(app, tw.A.users.carrier_admin).get(`/api/c/${tw.A.carrierId}/tenants`);
    expect(tenants.status).toBe(200);
    const tenantsText = await tenants.text();
    expect(tenantsText).toContain(tw.A.tenantId);
    expect(leaks(tenantsText)).toEqual([]);

    const driver = driverHarness();
    const { jar } = await driver.open(tw.A.bookings.own.driverToken);
    const view = await driver.request('GET', '/api/driver/booking', { jar });
    expect(view.status).toBe(200);
    expect(leaks(await view.text())).toEqual([]);
  });
});
