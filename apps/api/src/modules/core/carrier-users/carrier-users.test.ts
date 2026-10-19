import type { CarrierUserList } from '@rampflow/shared/modules/core/api.staff';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import { testClock } from '../../../kernel/clock.ts';
import { appUser, membership } from '../schema.ts';
import { errorOf, inviteeEmail, membershipOf, sentInvitation } from '../staff/fixtures.ts';

// CR-04 through /api/c/:orgId/users against Postgres. That every user of a carrier sees all
// its bookings is the portal's list (U8), which filters by carrier, not by user.

const app = createApp({ clock: testClock(new Date()) });

let w: World;
beforeAll(async () => {
  w = await world();
});

const users = (side: World['A']) => `/api/c/${side.carrierId}/users`;

describe('CR-04 carrier users', () => {
  it('a carrier admin invites a colleague, who joins the carrier org', async () => {
    const email = inviteeEmail('colleague');
    const res = await as(app, w.A.users.carrier_admin).post(`${users(w.A)}/invitations`, {
      body: { email, role: 'carrier_user' },
    });
    expect(res.status).toBe(201);
    const sent = await sentInvitation(ownerDb(), email);
    expect(sent.mail).toMatchObject({ tenantId: null, locale: 'en' });
    expect(sent.mail?.payload).toMatchObject({
      orgName: expect.stringMatching(/^Carrier A /),
      role: 'carrier_user',
      inviterName: expect.any(String),
    });

    const inspected = await as(app, null).post('/api/public/invitations/inspect', {
      body: { token: sent.token },
    });
    expect(await inspected.json()).toMatchObject({ orgKind: 'carrier', role: 'carrier_user' });
    const accepted = await as(app, null).post('/api/public/invitations/accept', {
      body: { token: sent.token, name: 'Marta Kowalska', password: 'colleague password 1' },
    });
    expect(accepted.status).toBe(200);
    const [user] = await ownerDb().select().from(appUser).where(eq(appUser.email, email));
    const rows = await ownerDb()
      .select({ orgId: membership.orgId, role: membership.role })
      .from(membership)
      .where(eq(membership.userId, user?.id as never));
    expect(rows).toEqual([{ orgId: w.A.carrierId, role: 'carrier_user' }]);

    const list = (await (
      await as(app, w.A.users.carrier_admin).get(users(w.A))
    ).json()) as CarrierUserList;
    expect(list.members.map((m) => m.email)).toEqual(expect.arrayContaining([email]));
    expect(JSON.stringify(list)).not.toContain(w.A.rivalCarrierId);
  });

  it('a carrier user cannot invite (403)', async () => {
    const res = await as(app, w.A.users.carrier_user).post(`${users(w.A)}/invitations`, {
      body: { email: inviteeEmail(), role: 'carrier_user' },
    });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe('forbidden');
  });

  it('promotes and removes colleagues of the own org only', async () => {
    const t = await world();
    const id = await membershipOf(ownerDb(), t.A.users.carrier_user.id);
    const rival = await as(app, t.A.users.rival_admin).patch(
      `/api/c/${t.A.rivalCarrierId}/users/${id}`,
      { body: { role: 'carrier_admin' } },
    );
    expect(rival.status).toBe(404);
    const promoted = await as(app, t.A.users.carrier_admin).patch(`${users(t.A)}/${id}`, {
      body: { role: 'carrier_admin' },
    });
    expect(await promoted.json()).toMatchObject({ role: 'carrier_admin', siteIds: [] });

    const context = `/api/c/${t.A.carrierId}/context`;
    expect((await as(app, t.A.users.carrier_user).get(context)).status).toBe(200);
    expect((await as(app, t.A.users.carrier_admin).delete(`${users(t.A)}/${id}`)).status).toBe(204);
    expect((await as(app, t.A.users.carrier_user).get(context)).status).toBe(404);
  });
});
