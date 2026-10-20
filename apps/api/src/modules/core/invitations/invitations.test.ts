import {
  ConflictReason,
  ErrorCode,
  OrgKind,
  Role,
  StaffLocale,
  UnauthorizedReason,
} from '@rampflow/shared/values';
import { and, eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerCount, ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, type WorldUser, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import type { UserId } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { account } from '../auth/fixtures.ts';
import { appUser, invitation, membership, membershipSite } from '../schema.ts';
import { invitationFor } from './fixtures.ts';

// PL-01, TN-01, CR-01 and CR-04, acceptance half: /api/public/invitations against Postgres.

const clock = testClock(new Date());
const app = createApp({ clock });
const anon = as(app, null);

const sessionOf = (res: Response) =>
  /rf_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? null;

/** A signed-in actor from a raw session token, for the `as()` helper. */
const signedIn = (sessionToken: string, id: UserId): WorldUser => ({
  id,
  email: '',
  role: Role.dispatcher,
  sessionToken,
});

const membershipsOf = (userId: UserId) =>
  ownerDb()
    .select({ orgId: membership.orgId, role: membership.role, id: membership.id })
    .from(membership)
    .where(eq(membership.userId, userId));

const isPending = async (id: string) => {
  const [row] = await ownerDb()
    .select({ acceptedAt: invitation.acceptedAt })
    .from(invitation)
    .where(eq(invitation.id, id as never));
  return row?.acceptedAt === null;
};

let w: World;
beforeAll(async () => {
  w = await world();
});

describe('a new user accepts', () => {
  it('a gate operator invitation: verified account, membership, site list and a session', async () => {
    const inv = await invitationFor(ownerDb(), {
      orgId: w.A.tenantId,
      orgKind: OrgKind.tenant,
      role: Role.gate_operator,
      invitedBy: w.A.users.tenant_admin.id,
      siteIds: [w.A.sites[1].id],
    });
    const seen = await anon.post('/api/public/invitations/inspect', { body: { token: inv.token } });
    expect(seen.status).toBe(200);
    expect(await seen.json()).toEqual({
      orgKind: 'tenant',
      orgName: expect.stringMatching(/^Tenant A /),
      role: Role.gate_operator,
      email: inv.email,
      hasAccount: false,
    });

    const res = await anon.post('/api/public/invitations/accept', {
      body: {
        token: inv.token,
        name: 'Gina Gate',
        password: 'gate password 2026',
        locale: StaffLocale.pl,
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgId: w.A.tenantId, orgKind: 'tenant' });
    const session = sessionOf(res);
    expect(session).not.toBeNull();

    const [user] = await ownerDb().select().from(appUser).where(eq(appUser.email, inv.email));
    expect(user).toMatchObject({ name: 'Gina Gate', locale: StaffLocale.pl });
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    const userId = user?.id as UserId;
    const [m] = await membershipsOf(userId);
    expect(m).toMatchObject({ orgId: w.A.tenantId, role: Role.gate_operator });
    expect(
      await ownerDb()
        .select({ siteId: membershipSite.siteId })
        .from(membershipSite)
        .where(eq(membershipSite.userId, userId)),
    ).toEqual([{ siteId: w.A.sites[1].id }]);

    const ctx = await as(app, signedIn(session ?? '', userId)).get(
      `/api/t/${w.A.tenantId}/context`,
    );
    expect(ctx.status).toBe(200);
    const body = (await ctx.json()) as { sites: { id: string }[]; role: string };
    expect(body.role).toBe('gate_operator');
    expect(body.sites.map((s) => s.id)).toEqual([w.A.sites[1].id]);
  });

  it('a carrier user invitation from a carrier admin (CR-04)', async () => {
    const inv = await invitationFor(ownerDb(), {
      orgId: w.A.carrierId,
      orgKind: OrgKind.carrier,
      role: Role.carrier_user,
      invitedBy: w.A.users.carrier_admin.id,
    });
    const res = await anon.post('/api/public/invitations/accept', {
      body: { token: inv.token, name: 'Piotr Nowak', password: 'carrier password 1' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgId: w.A.carrierId, orgKind: 'carrier' });
    const ctx = await as(app, signedIn(sessionOf(res) ?? '', '' as UserId)).get(
      `/api/c/${w.A.carrierId}/context`,
    );
    expect(ctx.status).toBe(200);
    expect(((await ctx.json()) as { role: string }).role).toBe('carrier_user');
  });

  it('without name and password answers 422 and leaves the invitation pending', async () => {
    const inv = await invitationFor(ownerDb(), {
      orgId: w.A.tenantId,
      orgKind: OrgKind.tenant,
      role: Role.dispatcher,
      invitedBy: w.A.users.tenant_admin.id,
    });
    const res = await anon.post('/api/public/invitations/accept', { body: { token: inv.token } });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { details: { issues: [{ path: ['name'] }, { path: ['password'] }] } },
    });
    expect(await isPending(inv.id)).toBe(true);
    expect(await ownerCount('app_user', sql`email = ${inv.email}`)).toBe(0);
  });

  it('once: two racing acceptances create one user and one membership', async () => {
    const inv = await invitationFor(ownerDb(), {
      orgId: w.A.tenantId,
      orgKind: OrgKind.tenant,
      role: Role.dispatcher,
      invitedBy: w.A.users.tenant_admin.id,
    });
    const body = { token: inv.token, name: 'Racer', password: 'race password 12' };
    const both = await Promise.all([
      anon.post('/api/public/invitations/accept', { body }),
      anon.post('/api/public/invitations/accept', { body }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(await ownerCount('app_user', sql`email = ${inv.email}`)).toBe(1);
    expect(
      await ownerCount(
        'membership',
        sql`user_id = (select id from app_user where email = ${inv.email})`,
      ),
    ).toBe(1);
  });
});

describe('an existing user accepts', () => {
  it('after signing in with the invited email, without a new session', async () => {
    const existing = await account(ownerDb());
    const inv = await invitationFor(ownerDb(), {
      orgId: w.A.tenantId,
      orgKind: OrgKind.tenant,
      role: Role.dispatcher,
      invitedBy: w.A.users.tenant_admin.id,
      email: existing.email,
    });
    const seen = await anon.post('/api/public/invitations/inspect', { body: { token: inv.token } });
    expect(((await seen.json()) as { hasAccount: boolean }).hasAccount).toBe(true);

    const anonymous = await anon.post('/api/public/invitations/accept', {
      body: { token: inv.token, name: 'Hijack', password: 'hijack password' },
    });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({
      error: {
        code: ErrorCode.unauthorized,
        details: { reason: UnauthorizedReason.sign_in_required },
      },
    });
    expect(await isPending(inv.id)).toBe(true);

    const login = await anon.post('/api/auth/login', {
      body: { email: existing.email, password: existing.password },
    });
    const me = signedIn(sessionOf(login) ?? '', existing.id);
    const res = await as(app, me).post('/api/public/invitations/accept', {
      body: { token: inv.token },
    });
    expect(res.status).toBe(200);
    expect(sessionOf(res)).toBeNull();
    expect(await membershipsOf(existing.id)).toEqual([
      expect.objectContaining({ orgId: w.A.tenantId, role: Role.dispatcher }),
    ]);
  });

  it('who is already a member gets 409 already_member and the invitation stays pending', async () => {
    const member = w.A.users.dispatcher;
    const inv = await invitationFor(ownerDb(), {
      orgId: w.A.tenantId,
      orgKind: OrgKind.tenant,
      role: Role.tenant_admin,
      invitedBy: w.platformAdmin.id,
      email: member.email,
    });
    const res = await as(app, member).post('/api/public/invitations/accept', {
      body: { token: inv.token },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { details: { reason: ConflictReason.already_member } },
    });
    expect(await isPending(inv.id)).toBe(true);
  });
});

describe('a token', () => {
  it('works once', async () => {
    const inv = await invitationFor(ownerDb(), {
      orgId: w.A.tenantId,
      orgKind: OrgKind.tenant,
      role: Role.dock_operator,
      invitedBy: w.A.users.tenant_admin.id,
    });
    const body = { token: inv.token, name: 'Dora Dock', password: 'dock password 12' };
    expect((await anon.post('/api/public/invitations/accept', { body })).status).toBe(200);
    expect((await anon.post('/api/public/invitations/accept', { body })).status).toBe(401);
    expect(
      (await anon.post('/api/public/invitations/inspect', { body: { token: inv.token } })).status,
    ).toBe(401);
  });

  it('expires after 7 days', async () => {
    const local = testClock(new Date());
    const later = createApp({ clock: local });
    const inv = await invitationFor(ownerDb(), {
      orgId: w.A.tenantId,
      orgKind: OrgKind.tenant,
      role: Role.dispatcher,
      invitedBy: w.A.users.tenant_admin.id,
      expiresAt: new Date(local.now().getTime() + 7 * 24 * 3600_000),
    });
    local.advance(7 * 24 * 3600_000);
    const res = await as(later, null).post('/api/public/invitations/accept', {
      body: { token: inv.token, name: 'Late', password: 'late password 12' },
    });
    expect(res.status).toBe(401);
    expect(await isPending(inv.id)).toBe(true);
  });

  it('of a revoked invitation answers 401', async () => {
    const inv = await invitationFor(ownerDb(), {
      orgId: w.A.tenantId,
      orgKind: OrgKind.tenant,
      role: Role.dispatcher,
      invitedBy: w.A.users.tenant_admin.id,
    });
    await ownerDb()
      .update(invitation)
      .set({ revokedAt: new Date() })
      .where(eq(invitation.id, inv.id));
    const res = await anon.post('/api/public/invitations/inspect', { body: { token: inv.token } });
    expect(res.status).toBe(401);
  });

  it('needs the same-origin header like every mutating request', async () => {
    const inv = await invitationFor(ownerDb(), {
      orgId: w.A.tenantId,
      orgKind: OrgKind.tenant,
      role: Role.dispatcher,
      invitedBy: w.A.users.tenant_admin.id,
    });
    const res = await anon.post('/api/public/invitations/inspect', {
      body: { token: inv.token },
      origin: 'https://evil.example',
    });
    expect(res.status).toBe(403);
    expect(await isPending(inv.id)).toBe(true);
  });
});

describe('removing a member (TN-01)', () => {
  it('ends access to that tenant on the next request while other memberships keep working', async () => {
    const own = await world();
    const user = own.A.users.dispatcher;
    await ownerDb().insert(membership).values({
      userId: user.id,
      orgId: own.B.tenantId,
      orgKind: 'tenant',
      role: Role.dispatcher,
    });
    const asUser = as(app, user);
    expect((await asUser.get(`/api/t/${own.A.tenantId}/context`)).status).toBe(200);

    await ownerDb()
      .delete(membership)
      .where(and(eq(membership.userId, user.id), eq(membership.orgId, own.A.tenantId)));

    const gone = await asUser.get(`/api/t/${own.A.tenantId}/context`);
    expect(gone.status).toBe(404);
    expect((await asUser.get(`/api/t/${own.B.tenantId}/context`)).status).toBe(200);
    const me = (await (await asUser.get('/api/me')).json()) as { memberships: { orgId: string }[] };
    expect(me.memberships.map((m) => m.orgId)).toEqual([own.B.tenantId]);
  });
});
