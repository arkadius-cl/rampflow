import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, type WorldUser, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { type CarrierId, type SiteId, type TenantId, wrapJson } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import {
  appUser,
  entitlementOverride,
  membership,
  org,
  tenantCarrierLink,
} from '../../core/schema.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { openLinkFor, setSiteSetting, unique } from '../carriers/fixtures.ts';
import { carrierRegistration } from '../schema.carriers.ts';

// CR-02 and TN-04 against Postgres: the public link, registration, email verification, the
// registration mode, approval and rejection.

const clock = testClock(new Date());
const app = createApp({ clock });
const anon = as(app, null);

const sessionOf = (res: Response) =>
  /rf_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? null;

const form = (email: string) => ({
  companyName: 'Baltic Freight UAB',
  country: 'LT',
  contactName: 'Rasa Jankauskiene',
  email,
  locale: 'en',
});

const mailsTo = (email: string) =>
  ownerDb().select().from(outboxMessage).where(eq(outboxMessage.toEmail, email));

/** The registration of `email` and the token its email links to. */
async function registered(email: string) {
  const [row] = await ownerDb()
    .select()
    .from(carrierRegistration)
    .where(eq(carrierRegistration.email, email));
  if (!row) throw new Error(`no registration for ${email}`);
  return { row, token: deriveToken('registration', row.id) };
}

const linkOf = async (tenantId: TenantId, carrierId: CarrierId) => {
  const [row] = await ownerDb()
    .select()
    .from(tenantCarrierLink)
    .where(
      and(eq(tenantCarrierLink.tenantId, tenantId), eq(tenantCarrierLink.carrierId, carrierId)),
    );
  return row ?? null;
};

let w: World;
let site: SiteId;
let admin: WorldUser;
beforeAll(async () => {
  w = await world();
  site = w.A.sites[0].id;
  admin = w.A.users.tenant_admin;
});

const open = (mode: 'auto_approve' | 'approval_required') =>
  openLinkFor(ownerDb(), { tenantId: w.A.tenantId, siteId: site, by: admin.id, mode });

async function registerAndVerify(slug: string, email: string) {
  const res = await anon.post(`/api/public/links/${slug}/registrations`, { body: form(email) });
  expect(res.status).toBe(202);
  const { token } = await registered(email);
  return anon.post('/api/public/registrations/verify', { body: { token } });
}

describe('TN-04 the public link', () => {
  it('shows tenant and site while enabled, and 404 once the site setting is off', async () => {
    const slug = await open('approval_required');
    const res = await anon.get(`/api/public/links/${slug}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tenantName: expect.stringMatching(/^Tenant A /) });

    const off = { tenantId: w.A.tenantId, siteId: site, by: admin.id };
    await setSiteSetting(ownerDb(), { ...off, key: 'booking.public_link_enabled', value: false });
    try {
      expect((await anon.get(`/api/public/links/${slug}`)).status).toBe(404);
      const post = await anon.post(`/api/public/links/${slug}/registrations`, {
        body: form(unique('closed')),
      });
      expect(post.status).toBe(404);
    } finally {
      await setSiteSetting(ownerDb(), { ...off, key: 'booking.public_link_enabled', value: true });
    }
  });

  it('answers 404 for an unknown slug and while the feature is off', async () => {
    expect((await anon.get('/api/public/links/aaaaaaaaaa')).status).toBe(404);
    const slug = await openLinkFor(ownerDb(), {
      tenantId: w.B.tenantId,
      siteId: w.B.sites[0].id,
      by: w.B.users.tenant_admin.id,
    });
    expect((await anon.get(`/api/public/links/${slug}`)).status).toBe(200);
    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: w.B.tenantId,
        key: 'booking.public_link',
        value: wrapJson(false),
        updatedBy: w.platformAdmin.id,
      });
    expect((await anon.get(`/api/public/links/${slug}`)).status).toBe(404);
  });

  it('the admin creates one slug per site; regenerate makes the old slug 404', async () => {
    const siteB = w.A.sites[1].id;
    const url = `/api/t/${w.A.tenantId}/carriers/public-links`;
    const first = await as(app, admin).post(url, { body: { siteId: siteB } });
    expect(first.status).toBe(201);
    const { slug } = (await first.json()) as { slug: string };
    expect(slug).toMatch(/^[a-z2-7]{10}$/);
    const again = await as(app, admin).post(url, { body: { siteId: siteB } });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ slug, enabled: false, mode: 'approval_required' });

    await setSiteSetting(ownerDb(), {
      tenantId: w.A.tenantId,
      siteId: siteB,
      by: admin.id,
      key: 'booking.public_link_enabled',
      value: true,
    });
    expect((await anon.get(`/api/public/links/${slug}`)).status).toBe(200);
    const fresh = await as(app, admin).post(`${url}/${siteB}/regenerate`);
    const { slug: next } = (await fresh.json()) as { slug: string };
    expect(next).not.toBe(slug);
    expect((await anon.get(`/api/public/links/${slug}`)).status).toBe(404);
    expect((await anon.get(`/api/public/links/${next}`)).status).toBe(200);

    const list = await as(app, admin).get(url);
    const items = (await list.json()) as { items: { siteId: string; slug: string | null }[] };
    expect(items.items).toContainEqual(expect.objectContaining({ siteId: siteB, slug: next }));
  });

  it('a site of another tenant answers 404', async () => {
    const res = await as(app, admin).post(`/api/t/${w.A.tenantId}/carriers/public-links`, {
      body: { siteId: w.B.sites[0].id },
    });
    expect(res.status).toBe(404);
  });
});

describe('CR-02 register through a public link', () => {
  it('answers an empty 202 and emails a verification link', async () => {
    const slug = await open('approval_required');
    const email = unique('new');
    const res = await anon.post(`/api/public/links/${slug}/registrations`, { body: form(email) });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
    const { row } = await registered(email);
    expect(row).toMatchObject({ status: 'pending_email', country: 'LT', userId: null });
    const [mail] = await mailsTo(email);
    expect(mail).toMatchObject({ template: 'booking.registration-verify' });
    expect(mail?.payload).toMatchObject({ registrationId: row.id, knownAccount: false });
  });

  it('auto_approve: verification creates the carrier, links it at once and signs in', async () => {
    const slug = await open('auto_approve');
    const email = unique('auto');
    const res = await registerAndVerify(slug, email);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { carrierId: CarrierId; status: string };
    expect(body.status).toBe('approved');
    expect(sessionOf(res)).not.toBeNull();
    const [company] = await ownerDb().select().from(org).where(eq(org.id, body.carrierId));
    expect(company).toMatchObject({ name: 'Baltic Freight UAB', country: 'LT' });
    expect(await linkOf(w.A.tenantId, body.carrierId)).toMatchObject({
      status: 'active',
      source: 'public_link',
    });
    const [user] = await ownerDb().select().from(appUser).where(eq(appUser.email, email));
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user?.passwordHash).toBeNull();
  });

  it('approval_required: the registration stays pending and the carrier sees it', async () => {
    const slug = await open('approval_required');
    const email = unique('pending');
    const res = await registerAndVerify(slug, email);
    const body = (await res.json()) as { carrierId: CarrierId; status: string };
    expect(body.status).toBe('pending_approval');
    expect(await linkOf(w.A.tenantId, body.carrierId)).toBeNull();

    const session = sessionOf(res) as string;
    const carrierUser = {
      id: '' as never,
      email,
      role: 'carrier_admin' as const,
      sessionToken: session,
    };
    const tenants = await as(app, carrierUser).get(`/api/c/${body.carrierId}/tenants`);
    expect(await tenants.json()).toEqual({
      items: [
        {
          tenantId: w.A.tenantId,
          name: expect.stringMatching(/^Tenant A /),
          link: null,
          registration: expect.objectContaining({ status: 'pending_approval' }),
        },
      ],
    });
  });

  it('works once: a second verification answers 401, also when signed in', async () => {
    const slug = await open('approval_required');
    const email = unique('once');
    const first = await registerAndVerify(slug, email);
    expect(first.status).toBe(200);
    const { token, row } = await registered(email);
    const verifiedUser = {
      id: row.userId as never,
      email,
      role: 'carrier_admin' as const,
      sessionToken: sessionOf(first) as string,
    };
    const res = await as(app, verifiedUser).post('/api/public/registrations/verify', {
      body: { token },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { message: 'Invalid or expired link' } });
  });

  it('a known email gets the same 202, a sign-in prompt, and attaches to its org', async () => {
    const slug = await open('auto_approve');
    const known = w.B.users.carrier_admin;
    const res = await anon.post(`/api/public/links/${slug}/registrations`, {
      body: form(known.email),
    });
    const fresh = await anon.post(`/api/public/links/${slug}/registrations`, {
      body: form(unique('unknown')),
    });
    const answer = async (r: Response) => ({
      status: r.status,
      body: await r.text(),
      type: r.headers.get('content-type'),
      cookie: r.headers.get('set-cookie'),
    });
    expect(await answer(res)).toEqual(await answer(fresh));
    expect(res.status).toBe(202);
    const [mail] = await mailsTo(known.email);
    expect(mail?.payload).toMatchObject({ knownAccount: true });

    const { token } = await registered(known.email);
    const anonymous = await anon.post('/api/public/registrations/verify', { body: { token } });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({
      error: { details: { reason: 'sign_in_required', email: known.email } },
    });

    const orgsBefore = (await ownerDb().select({ id: org.id }).from(org)).length;
    const verified = await as(app, known).post('/api/public/registrations/verify', {
      body: { token },
    });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ carrierId: w.B.carrierId, status: 'approved' });
    expect((await ownerDb().select({ id: org.id }).from(org)).length).toBe(orgsBefore);
    expect(await linkOf(w.A.tenantId, w.B.carrierId)).toMatchObject({ status: 'active' });
  });

  it('auto_approve leaves a link the tenant deactivated switched off', async () => {
    await ownerDb()
      .update(tenantCarrierLink)
      .set({ status: 'deactivated', deactivatedAt: new Date() })
      .where(
        and(
          eq(tenantCarrierLink.tenantId, w.A.tenantId),
          eq(tenantCarrierLink.carrierId, w.A.rivalCarrierId),
        ),
      );
    const slug = await open('auto_approve');
    const rival = w.A.users.rival_admin;
    await anon.post(`/api/public/links/${slug}/registrations`, { body: form(rival.email) });
    const { token } = await registered(rival.email);
    const res = await as(app, rival).post('/api/public/registrations/verify', { body: { token } });
    expect(res.status).toBe(200);
    expect(await linkOf(w.A.tenantId, w.A.rivalCarrierId)).toMatchObject({
      status: 'deactivated',
    });
  });

  it('the link expires after 24 hours', async () => {
    const slug = await open('approval_required');
    const email = unique('slow');
    await anon.post(`/api/public/links/${slug}/registrations`, { body: form(email) });
    const { token } = await registered(email);
    clock.advance(24 * 3600_000 + 1);
    try {
      const res = await anon.post('/api/public/registrations/verify', { body: { token } });
      expect(res.status).toBe(401);
    } finally {
      clock.set(new Date());
    }
  });
});

describe('CR-02 registration limits', () => {
  it('a sixth registration of one email within an hour answers 202 and writes nothing', async () => {
    const slug = await open('approval_required');
    const email = unique('flood');
    for (let i = 0; i < 6; i++) {
      const res = await anon.post(`/api/public/links/${slug}/registrations`, { body: form(email) });
      expect(res.status).toBe(202);
    }
    const rows = await ownerDb()
      .select({ id: carrierRegistration.id })
      .from(carrierRegistration)
      .where(eq(carrierRegistration.email, email));
    expect(rows).toHaveLength(5);
    expect(await mailsTo(email)).toHaveLength(5);
  });
});

describe('CR-02 concurrent verification', () => {
  it('two verifications of one link: exactly one succeeds and one carrier org exists', async () => {
    const slug = await open('approval_required');
    const email = unique('race');
    await anon.post(`/api/public/links/${slug}/registrations`, { body: form(email) });
    const { token } = await registered(email);
    const both = await Promise.all([
      anon.post('/api/public/registrations/verify', { body: { token } }),
      anon.post('/api/public/registrations/verify', { body: { token } }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 401]);
    const { row } = await registered(email);
    const companies = await ownerDb()
      .select({ id: org.id })
      .from(org)
      .where(eq(org.name, 'Baltic Freight UAB'));
    expect(companies.map((c) => c.id)).toContain(row.carrierId);
    const [user] = await ownerDb().select().from(appUser).where(eq(appUser.email, email));
    const memberships = await ownerDb()
      .select({ orgId: membership.orgId })
      .from(membership)
      .where(eq(membership.userId, user?.id as never));
    expect(memberships).toEqual([{ orgId: row.carrierId }]);
  });
});

describe('TN-04 decide a registration', () => {
  async function pendingRegistration() {
    const slug = await open('approval_required');
    const email = unique('decide');
    const res = await registerAndVerify(slug, email);
    const { carrierId } = (await res.json()) as { carrierId: CarrierId };
    const { row } = await registered(email);
    return { id: row.id, email, carrierId };
  }
  const url = (id: string, action: 'approve' | 'reject') =>
    `/api/t/${w.A.tenantId}/carriers/registrations/${id}/${action}`;

  it('approving links the carrier and emails it', async () => {
    const reg = await pendingRegistration();
    const listed = await as(app, w.A.users.dispatcher).get(
      `/api/t/${w.A.tenantId}/carriers/registrations`,
    );
    const { items } = (await listed.json()) as { items: { id: string; status: string }[] };
    expect(items).toContainEqual(
      expect.objectContaining({ id: reg.id, status: 'pending_approval' }),
    );

    const res = await as(app, w.A.users.dispatcher).post(url(reg.id, 'approve'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'approved' });
    expect(await linkOf(w.A.tenantId, reg.carrierId)).toMatchObject({
      status: 'active',
      source: 'public_link',
    });
    const templates = (await mailsTo(reg.email)).map((m) => m.template);
    expect(templates).toContain('booking.registration-approved');

    const twice = await as(app, w.A.users.dispatcher).post(url(reg.id, 'approve'));
    expect(twice.status).toBe(409);
    expect(await twice.json()).toMatchObject({
      error: { details: { reason: 'invalid_transition', status: 'approved' } },
    });
  });

  it('approve racing reject: exactly one decision wins', async () => {
    const reg = await pendingRegistration();
    const [approved, rejected] = await Promise.all([
      as(app, w.A.users.dispatcher).post(url(reg.id, 'approve')),
      as(app, w.A.users.dispatcher).post(url(reg.id, 'reject'), { body: { reason: 'Late.' } }),
    ]);
    expect([approved.status, rejected.status].sort()).toEqual([200, 409]);
    const linked = await linkOf(w.A.tenantId, reg.carrierId);
    expect(linked !== null).toBe(approved.status === 200);
  });

  it('rejecting emails the reason and links nothing', async () => {
    const reg = await pendingRegistration();
    const res = await as(app, w.A.users.dispatcher).post(url(reg.id, 'reject'), {
      body: { reason: 'We only work with ADR carriers.' },
    });
    expect(res.status).toBe(200);
    expect(await linkOf(w.A.tenantId, reg.carrierId)).toBeNull();
    const rejected = (await mailsTo(reg.email)).find(
      (m) => m.template === 'booking.registration-rejected',
    );
    expect(rejected?.payload).toMatchObject({ reason: 'We only work with ADR carriers.' });
  });
});

describe('registration emails are account emails', () => {
  it('verify, approved and rejected emails go out while notify.email is off', async () => {
    const quiet = await world();
    const admin = quiet.A.users.tenant_admin;
    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: quiet.A.tenantId,
        key: 'notify.email',
        value: wrapJson(false),
        updatedBy: quiet.platformAdmin.id,
      });
    const slug = await openLinkFor(ownerDb(), {
      tenantId: quiet.A.tenantId,
      siteId: quiet.A.sites[0].id,
      by: admin.id,
    });
    const decided: string[] = [];
    for (const action of ['approve', 'reject'] as const) {
      const email = unique(`quiet-${action}`);
      expect((await registerAndVerify(slug, email)).status).toBe(200);
      const { row } = await registered(email);
      const res = await as(app, quiet.A.users.dispatcher).post(
        `/api/t/${quiet.A.tenantId}/carriers/registrations/${row.id}/${action}`,
        action === 'reject' ? { body: { reason: 'Full.' } } : {},
      );
      expect(res.status).toBe(200);
      decided.push(...(await mailsTo(email)).map((m) => m.template));
    }
    expect(decided.sort()).toEqual([
      'booking.registration-approved',
      'booking.registration-rejected',
      'booking.registration-verify',
      'booking.registration-verify',
    ]);
  });
});
