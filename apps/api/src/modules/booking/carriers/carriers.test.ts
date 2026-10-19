import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { asParty, ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, type WorldUser, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { type CarrierId, type UserId, wrapJson } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { account } from '../../core/auth/fixtures.ts';
import { entitlementOverride, membership, org, tenantCarrierLink } from '../../core/schema.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { carrierInvitation } from '../schema.carriers.ts';
import { booking } from '../schema.ts';
import { carrierInvitationFor, unique } from './fixtures.ts';
import { assertActiveLink } from './links.ts';

// TN-03 and CR-01 against Postgres: invite, accept as a new or an existing carrier user,
// single use and expiry, deactivation and assertActiveLink.

const DAY = 24 * 3600_000;
const clock = testClock(new Date());
const app = createApp({ clock });
const anon = as(app, null);

const sessionOf = (res: Response) =>
  /rf_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? null;

const userWith = (sessionToken: string, id: UserId): WorldUser => ({
  id,
  email: '',
  role: 'carrier_admin',
  sessionToken,
});

const outboxTo = (email: string) =>
  ownerDb().select().from(outboxMessage).where(eq(outboxMessage.toEmail, email));

const linkOf = async (w: World, carrierId: CarrierId) => {
  const [row] = await ownerDb()
    .select()
    .from(tenantCarrierLink)
    .where(
      and(eq(tenantCarrierLink.tenantId, w.A.tenantId), eq(tenantCarrierLink.carrierId, carrierId)),
    );
  return row;
};

let w: World;
beforeAll(async () => {
  w = await world();
});

describe('TN-03 invite a carrier', () => {
  it('stores the invitation by company name and email and enqueues its email', async () => {
    const email = unique('invite');
    const res = await as(app, w.A.users.dispatcher).post(
      `/api/t/${w.A.tenantId}/carriers/invitations`,
      { body: { companyName: 'Baltic Freight UAB', email, locale: 'pl' } },
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ companyName: 'Baltic Freight UAB', email });
    const [mail] = await outboxTo(email);
    expect(mail).toMatchObject({ template: 'booking.carrier-invitation', locale: 'pl' });
    expect(mail?.payload).toMatchObject({ companyName: 'Baltic Freight UAB' });
    expect(JSON.stringify(mail?.payload)).not.toMatch(/carrier-invite#/);

    const list = await as(app, w.A.users.dispatcher).get(`/api/t/${w.A.tenantId}/carriers`);
    const body = (await list.json()) as { invitations: { email: string }[] };
    expect(body.invitations.map((i) => i.email)).toContain(email);
  });

  it('still emails the invitation while notify.email is off: it is an account email', async () => {
    const email = unique('quiet');
    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: w.B.tenantId,
        key: 'notify.email',
        value: wrapJson(false),
        updatedBy: w.platformAdmin.id,
      });
    const res = await as(app, w.B.users.dispatcher).post(
      `/api/t/${w.B.tenantId}/carriers/invitations`,
      { body: { companyName: 'Quiet Haulage', email } },
    );
    expect(res.status).toBe(201);
    expect(await outboxTo(email)).toHaveLength(1);
  });

  it('inviting the same email again revokes the first link', async () => {
    const email = unique('again');
    const post = () =>
      as(app, w.A.users.dispatcher).post(`/api/t/${w.A.tenantId}/carriers/invitations`, {
        body: { companyName: 'Twice GmbH', email },
      });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(201);
    const rows = await ownerDb()
      .select()
      .from(carrierInvitation)
      .where(eq(carrierInvitation.email, email));
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });
});

describe('CR-01 accept a carrier invitation', () => {
  it('a new user: carrier org from the invitation, carrier admin, active link, session', async () => {
    const inv = await carrierInvitationFor(ownerDb(), {
      tenantId: w.A.tenantId,
      invitedBy: w.A.users.dispatcher.id,
    });
    const seen = await anon.post('/api/public/carrier-invitations/inspect', {
      body: { token: inv.token },
    });
    expect(await seen.json()).toEqual({
      tenantName: expect.stringMatching(/^Tenant A /),
      companyName: 'Invited Spedition',
      email: inv.email,
      hasAccount: false,
    });

    const res = await anon.post('/api/public/carrier-invitations/accept', {
      body: { token: inv.token, name: 'Piotr Nowak', password: 'carrier password 2026' },
    });
    expect(res.status).toBe(200);
    const { carrierId } = (await res.json()) as { carrierId: CarrierId };
    expect(sessionOf(res)).not.toBeNull();
    const [company] = await ownerDb().select().from(org).where(eq(org.id, carrierId));
    expect(company).toMatchObject({ kind: 'carrier', name: 'Invited Spedition' });
    const members = await ownerDb()
      .select({ role: membership.role })
      .from(membership)
      .where(eq(membership.orgId, carrierId));
    expect(members).toEqual([{ role: 'carrier_admin' }]);
    expect(await linkOf(w, carrierId)).toMatchObject({ status: 'active', source: 'invitation' });

    const tenantView = await as(app, w.A.users.dispatcher).get(`/api/t/${w.A.tenantId}/carriers`);
    const network = (await tenantView.json()) as { links: { carrierId: string; name: string }[] };
    expect(network.links).toContainEqual(
      expect.objectContaining({ carrierId, name: 'Invited Spedition' }),
    );
  });

  it('a new user without name or password gets 422 and the invitation stays pending', async () => {
    const inv = await carrierInvitationFor(ownerDb(), {
      tenantId: w.A.tenantId,
      invitedBy: w.A.users.dispatcher.id,
    });
    const res = await anon.post('/api/public/carrier-invitations/accept', {
      body: { token: inv.token },
    });
    expect(res.status).toBe(422);
    const [row] = await ownerDb()
      .select({ acceptedAt: carrierInvitation.acceptedAt })
      .from(carrierInvitation)
      .where(eq(carrierInvitation.id, inv.id as never));
    expect(row?.acceptedAt).toBeNull();
  });

  it("an existing carrier user's email links that org instead of creating one", async () => {
    const carrierAdmin = w.B.users.carrier_admin;
    const inv = await carrierInvitationFor(ownerDb(), {
      tenantId: w.A.tenantId,
      invitedBy: w.A.users.dispatcher.id,
      email: carrierAdmin.email,
    });
    const body = { token: inv.token };
    const anonymous = await anon.post('/api/public/carrier-invitations/accept', { body });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({
      error: { details: { reason: 'sign_in_required' } },
    });

    const orgsBefore = await ownerDb().select({ id: org.id }).from(org);
    const res = await as(app, carrierAdmin).post('/api/public/carrier-invitations/accept', {
      body,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ carrierId: w.B.carrierId });
    expect(await ownerDb().select({ id: org.id }).from(org)).toHaveLength(orgsBefore.length);
    expect(await linkOf(w, w.B.carrierId)).toMatchObject({ status: 'active' });
  });

  it('works once', async () => {
    const inv = await carrierInvitationFor(ownerDb(), {
      tenantId: w.A.tenantId,
      invitedBy: w.A.users.dispatcher.id,
    });
    const body = { token: inv.token, name: 'Once Only', password: 'carrier password 2026' };
    expect((await anon.post('/api/public/carrier-invitations/accept', { body })).status).toBe(200);
    expect((await anon.post('/api/public/carrier-invitations/accept', { body })).status).toBe(401);
  });

  it('expires after 7 days', async () => {
    const inv = await carrierInvitationFor(ownerDb(), {
      tenantId: w.A.tenantId,
      invitedBy: w.A.users.dispatcher.id,
      expiresAt: new Date(clock.now().getTime() + 7 * DAY),
    });
    const body = { token: inv.token, name: 'Late Larry', password: 'carrier password 2026' };
    clock.advance(7 * DAY + 1);
    try {
      expect((await anon.post('/api/public/carrier-invitations/accept', { body })).status).toBe(
        401,
      );
    } finally {
      clock.set(new Date());
    }
  });

  it('a revoked invitation answers 401', async () => {
    const inv = await carrierInvitationFor(ownerDb(), {
      tenantId: w.A.tenantId,
      invitedBy: w.A.users.dispatcher.id,
    });
    const revoke = await as(app, w.A.users.dispatcher).delete(
      `/api/t/${w.A.tenantId}/carriers/invitations/${inv.id}`,
    );
    expect(revoke.status).toBe(204);
    const res = await anon.post('/api/public/carrier-invitations/inspect', {
      body: { token: inv.token },
    });
    expect(res.status).toBe(401);
  });

  it('a session of another user creates the invitee account and signs this browser in as them', async () => {
    const other = await account(ownerDb());
    const inv = await carrierInvitationFor(ownerDb(), {
      tenantId: w.A.tenantId,
      invitedBy: w.A.users.dispatcher.id,
    });
    const login = await anon.post('/api/auth/login', {
      body: { email: other.email, password: other.password },
    });
    const session = sessionOf(login) as string;
    const res = await as(app, userWith(session, other.id)).post(
      '/api/public/carrier-invitations/accept',
      { body: { token: inv.token, name: 'New Person', password: 'carrier password 2026' } },
    );
    // The invitee has no account yet, so this creates it and signs that browser in as the invitee.
    expect(res.status).toBe(200);
    expect(sessionOf(res)).not.toBe(session);
  });
});

describe('TN-03 deactivate a link', () => {
  it('blocks new bookings through assertActiveLink while existing bookings stay visible', async () => {
    const url = `/api/t/${w.A.tenantId}/carriers/${w.A.carrierId}`;
    const off = await as(app, w.A.users.dispatcher).patch(url, { body: { status: 'deactivated' } });
    expect(off.status).toBe(200);
    expect(await off.json()).toMatchObject({ status: 'deactivated', carrierId: w.A.carrierId });

    const atTenant = {
      party: 'carrier_at_tenant',
      carrierId: w.A.carrierId,
      tenantId: w.A.tenantId,
      userId: w.A.users.carrier_user.id,
      role: 'carrier_user',
    } as const;
    const refused = await asParty(atTenant, (tx) =>
      assertActiveLink(tx, w.A.tenantId, w.A.carrierId).then(
        () => null,
        (e: unknown) => e,
      ),
    );
    expect(refused).toBeInstanceOf(ApiError);
    expect(refused).toMatchObject({ code: 'forbidden', details: { reason: 'link_inactive' } });

    const carrier = {
      party: 'carrier',
      carrierId: w.A.carrierId,
      userId: w.A.users.carrier_user.id,
      role: 'carrier_user',
    } as const;
    const own = await asParty(carrier, (tx) =>
      tx.select({ id: booking.id }).from(booking).where(eq(booking.id, w.A.bookings.own.id)),
    );
    expect(own).toEqual([{ id: w.A.bookings.own.id }]);
    const staff = await asParty(
      {
        party: 'tenant',
        tenantId: w.A.tenantId,
        siteIds: 'all',
        actor: { kind: 'user', userId: w.A.users.dispatcher.id, role: 'dispatcher' },
      },
      (tx) =>
        tx.select({ id: booking.id }).from(booking).where(eq(booking.id, w.A.bookings.own.id)),
    );
    expect(staff).toHaveLength(1);

    const tenants = await as(app, w.A.users.carrier_user).get(`/api/c/${w.A.carrierId}/tenants`);
    const listed = (await tenants.json()) as { items: { tenantId: string; link: unknown }[] };
    expect(listed.items).toContainEqual(
      expect.objectContaining({
        tenantId: w.A.tenantId,
        link: expect.objectContaining({ status: 'deactivated' }),
      }),
    );

    const on = await as(app, w.A.users.dispatcher).patch(url, { body: { status: 'active' } });
    expect(await on.json()).toMatchObject({ status: 'active', deactivatedAt: null });
    await asParty(atTenant, (tx) => assertActiveLink(tx, w.A.tenantId, w.A.carrierId));
  });

  it('answers 404 for a carrier without a link to this tenant', async () => {
    const res = await as(app, w.A.users.dispatcher).patch(
      `/api/t/${w.A.tenantId}/carriers/${w.B.rivalCarrierId}`,
      { body: { status: 'deactivated' } },
    );
    expect(res.status).toBe(404);
  });
});
