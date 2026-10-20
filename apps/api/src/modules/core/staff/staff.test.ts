import type { StaffList } from '@rampflow/shared/modules/core/api.staff';
import { Role } from '@rampflow/shared/values';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, type WorldUser, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import { entitlementOverride, invitation, membershipSite } from '../schema.ts';
import { errorOf, inviteeEmail, membershipOf, sentInvitation } from './fixtures.ts';

// TN-01 through /api/t/:orgId/staff against Postgres.

const clock = testClock(new Date());
const app = createApp({ clock });

let w: World;
beforeAll(async () => {
  w = await world();
});

const staff = (side: World['A']) => `/api/t/${side.tenantId}/staff`;
const admin = (side: World['A']) => as(app, side.users.tenant_admin);

/** Accepts the newest invitation to `email` as a new user and returns that user as an actor. */
async function accept(email: string, role: WorldUser['role']): Promise<WorldUser> {
  const { token } = await sentInvitation(ownerDb(), email);
  const res = await as(app, null).post('/api/public/invitations/accept', {
    body: { token, name: 'New Colleague', password: 'colleague password 1' },
  });
  expect(res.status).toBe(200);
  const sessionToken = /rf_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
  const [row] = await ownerDb()
    .select({ userId: invitation.acceptedUserId })
    .from(invitation)
    .where(eq(invitation.email, email));
  return { id: row?.userId as WorldUser['id'], email, role, sessionToken };
}

describe('TN-01 staff', () => {
  it('invites a gate operator for one site, who then gets 404 for the other site', async () => {
    const email = inviteeEmail('gate');
    const res = await admin(w.A).post(`${staff(w.A)}/invitations`, {
      body: { email, role: 'gate_operator', siteIds: [w.A.sites[0].id] },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      email,
      role: 'gate_operator',
      siteIds: [w.A.sites[0].id],
      expired: false,
    });
    const { mail } = await sentInvitation(ownerDb(), email);
    expect(mail).toMatchObject({ tenantId: w.A.tenantId, locale: 'de' });
    expect(mail?.payload).toMatchObject({ role: 'gate_operator', inviterName: expect.any(String) });

    const gate = await accept(email, Role.gate_operator);
    const sites = `/api/t/${w.A.tenantId}/sites`;
    expect((await as(app, gate).get(`${sites}/${w.A.sites[0].id}`)).status).toBe(200);
    expect((await as(app, gate).get(`${sites}/${w.A.sites[1].id}`)).status).toBe(404);
  });

  it('lists members with their sites and pending invitations', async () => {
    const email = inviteeEmail('pending');
    await admin(w.A).post(`${staff(w.A)}/invitations`, { body: { email, role: 'dispatcher' } });
    const list = (await (await admin(w.A).get(staff(w.A))).json()) as StaffList;
    const gate = list.members.find((m) => m.userId === w.A.users.gate_operator.id);
    expect(gate).toMatchObject({
      role: 'gate_operator',
      siteIds: [w.A.sites[0].id],
      email: w.A.users.gate_operator.email,
      self: false,
    });
    expect(list.members.find((m) => m.self)?.userId).toBe(w.A.users.tenant_admin.id);
    expect(list.invitations).toEqual(
      expect.arrayContaining([expect.objectContaining({ email, role: 'dispatcher' })]),
    );
    expect(JSON.stringify(list)).not.toContain(w.B.tenantId);
  });

  it('rejects a site list for other roles and sites of another tenant with 422', async () => {
    const dispatcher = await admin(w.A).post(`${staff(w.A)}/invitations`, {
      body: { email: inviteeEmail(), role: 'dispatcher', siteIds: [w.A.sites[0].id] },
    });
    expect(dispatcher.status).toBe(422);
    expect((await errorOf(dispatcher)).details?.issues).toEqual([
      expect.objectContaining({ path: ['siteIds'] }),
    ]);
    const foreign = await admin(w.A).post(`${staff(w.A)}/invitations`, {
      body: { email: inviteeEmail(), role: 'gate_operator', siteIds: [w.B.sites[0].id] },
    });
    expect(foreign.status).toBe(422);
    expect((await errorOf(foreign)).details?.issues).toEqual([
      expect.objectContaining({ path: ['siteIds', 0] }),
    ]);
  });

  it('answers 409 limit_reached at core.max_internal_users, counting pending invitations', async () => {
    const t = await world();
    const path = staff(t.A);
    // Six members plus one pending invitation, then a limit of 8.
    await admin(t.A).post(`${path}/invitations`, {
      body: { email: inviteeEmail(), role: 'dispatcher' },
    });
    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: t.A.tenantId,
        key: 'core.max_internal_users',
        value: { v: 8 },
        updatedBy: t.platformAdmin.id,
      });
    const last = inviteeEmail('last');
    const ok = await admin(t.A).post(`${path}/invitations`, {
      body: { email: last, role: 'dispatcher' },
    });
    expect(ok.status).toBe(201);
    const over = await admin(t.A).post(`${path}/invitations`, {
      body: { email: inviteeEmail(), role: 'dispatcher' },
    });
    expect(over.status).toBe(409);
    expect(await errorOf(over)).toMatchObject({
      code: 'limit_reached',
      details: { key: 'core.max_internal_users', limit: 8 },
    });
    // Re-inviting a pending email replaces its invitation, so it still fits.
    const again = await admin(t.A).post(`${path}/invitations`, {
      body: { email: last, role: 'dispatcher' },
    });
    expect(again.status).toBe(201);
  });

  it('answers 409 already_member for a member email', async () => {
    const res = await admin(w.A).post(`${staff(w.A)}/invitations`, {
      body: { email: w.A.users.dispatcher.email.toUpperCase(), role: 'dispatcher' },
    });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({ details: { reason: 'already_member' } });
  });

  it('revokes an invitation, after which its link no longer works', async () => {
    const email = inviteeEmail('revoked');
    const created = (await (
      await admin(w.A).post(`${staff(w.A)}/invitations`, { body: { email, role: 'dispatcher' } })
    ).json()) as { id: string };
    const { token } = await sentInvitation(ownerDb(), email);
    // Another tenant's admin cannot revoke it.
    const foreign = await admin(w.B).delete(`${staff(w.B)}/invitations/${created.id}`);
    expect(foreign.status).toBe(204);
    const inspect = () =>
      as(app, null).post('/api/public/invitations/inspect', { body: { token } });
    expect((await inspect()).status).toBe(200);
    expect((await admin(w.A).delete(`${staff(w.A)}/invitations/${created.id}`)).status).toBe(204);
    expect((await inspect()).status).toBe(401);
  });

  it('changes a role and site list; a role without sites loses its rows', async () => {
    const t = await world();
    const id = await membershipOf(ownerDb(), t.A.users.dispatcher.id);
    const toGate = await admin(t.A).patch(`${staff(t.A)}/${id}`, {
      body: { role: 'gate_operator', siteIds: [t.A.sites[1].id] },
    });
    expect(toGate.status).toBe(200);
    expect(await toGate.json()).toMatchObject({
      role: 'gate_operator',
      siteIds: [t.A.sites[1].id],
    });
    const sites = `/api/t/${t.A.tenantId}/sites`;
    expect((await as(app, t.A.users.dispatcher).get(`${sites}/${t.A.sites[0].id}`)).status).toBe(
      404,
    );

    const back = await admin(t.A).patch(`${staff(t.A)}/${id}`, { body: { role: 'dispatcher' } });
    expect(await back.json()).toMatchObject({ role: 'dispatcher', siteIds: [] });
    const rows = await ownerDb()
      .select()
      .from(membershipSite)
      .where(eq(membershipSite.membershipId, id));
    expect(rows).toEqual([]);
    expect((await as(app, t.A.users.dispatcher).get(`${sites}/${t.A.sites[0].id}`)).status).toBe(
      200,
    );
    // Another tenant's member is unknown here.
    const foreign = await admin(t.B).patch(`${staff(t.B)}/${id}`, { body: { role: 'dispatcher' } });
    expect(foreign.status).toBe(404);
  });

  it('removing a member ends their access to this tenant on the next request', async () => {
    const t = await world();
    const dock = t.A.users.dock_operator;
    const context = `/api/t/${t.A.tenantId}/context`;
    expect((await as(app, dock).get(context)).status).toBe(200);
    const id = await membershipOf(ownerDb(), dock.id);
    expect((await admin(t.B).delete(`${staff(t.B)}/${id}`)).status).toBe(204);
    expect((await as(app, dock).get(context)).status).toBe(200);
    expect((await admin(t.A).delete(`${staff(t.A)}/${id}`)).status).toBe(204);
    expect((await as(app, dock).get(context)).status).toBe(404);
  });

  it('is for tenant admins only', async () => {
    const res = await as(app, w.A.users.dispatcher).get(staff(w.A));
    expect(res.status).toBe(403);
  });
});
