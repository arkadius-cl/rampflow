import type {
  PackageList,
  TenantDetail,
  TenantList,
} from '@rampflow/shared/modules/core/api.platform';
import type { SettingEntry, SettingsView } from '@rampflow/shared/modules/core/api.settings';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { type World, world } from '../../../../test/world.ts';
import { createApp } from '../../../app.ts';
import type { TenantId } from '../../../db/ids.ts';
import { testClock } from '../../../kernel/clock.ts';
import { appUser, membership, settingValue, tenantSubscription } from '../schema.ts';
import { errorOf, inviteeEmail, sentInvitation } from '../staff/fixtures.ts';

// PL-01 to PL-04 through /api/platform against Postgres.

const clock = testClock(new Date());
const app = createApp({ clock });

let w: World;
beforeAll(async () => {
  w = await world({ packages: { A: 'start', B: 'pro' } });
});

// Platform rows are global to this worker's database; leave none behind for later files.
afterAll(async () => {
  await ownerDb().delete(settingValue).where(isNull(settingValue.tenantId));
});

const platform = () => as(app, w.platformAdmin);
const overridePath = (tenantId: string, key: string) =>
  `/api/platform/tenants/${tenantId}/overrides/${key}`;
const invite = (side: World['A'], email = inviteeEmail('staff')) =>
  as(app, side.users.tenant_admin).post(`/api/t/${side.tenantId}/staff/invitations`, {
    body: { email, role: 'dispatcher' },
  });

describe('PL-01 create a tenant', () => {
  it('gives the package, invites the admin, and acceptance makes them tenant_admin of it only', async () => {
    const adminEmail = inviteeEmail('acme-admin');
    const res = await platform().post('/api/platform/tenants', {
      body: { name: 'Acme Logistics', package: 'start', adminEmail },
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as TenantDetail;
    expect(created).toMatchObject({ name: 'Acme Logistics', package: 'start' });
    const portal = created.entitlements.find((e) => e.key === 'booking.carrier_portal');
    expect(portal).toMatchObject({ value: true, source: 'package' });
    expect(created.entitlements.find((e) => e.key === 'safety.quiz')).toMatchObject({
      value: false,
      source: 'default',
    });
    expect(created.adminInvitations).toEqual([expect.objectContaining({ email: adminEmail })]);

    const sent = await sentInvitation(ownerDb(), adminEmail);
    expect(sent.row).toMatchObject({ orgId: created.id, role: 'tenant_admin', orgKind: 'tenant' });
    expect(sent.mail?.payload).toEqual({
      invitationId: sent.row.id,
      orgName: 'Acme Logistics',
      role: 'tenant_admin',
      inviterName: null,
    });

    const accepted = await as(app, null).post('/api/public/invitations/accept', {
      body: { token: sent.token, name: 'Anna Lenz', password: 'acme admin password' },
    });
    expect(accepted.status).toBe(200);
    const [user] = await ownerDb().select().from(appUser).where(eq(appUser.email, adminEmail));
    const memberships = await ownerDb()
      .select({ orgId: membership.orgId, role: membership.role })
      .from(membership)
      .where(eq(membership.userId, user?.id as never));
    expect(memberships).toEqual([{ orgId: created.id, role: 'tenant_admin' }]);
  });

  it('re-invites a tenant admin: the earlier link stops working', async () => {
    const email = inviteeEmail('second-admin');
    const path = `/api/platform/tenants/${w.B.tenantId}/invitations`;
    expect((await platform().post(path, { body: { email } })).status).toBe(201);
    const first = await sentInvitation(ownerDb(), email);
    expect((await platform().post(path, { body: { email } })).status).toBe(201);
    const second = await sentInvitation(ownerDb(), email);
    expect(second.row.id).not.toBe(first.row.id);
    const inspect = (token: string) =>
      as(app, null).post('/api/public/invitations/inspect', { body: { token } });
    expect((await inspect(first.token)).status).toBe(401);
    expect((await inspect(second.token)).status).toBe(200);
  });

  it('answers 422 for a package that does not exist and 404 for an unknown tenant', async () => {
    const res = await platform().post('/api/platform/tenants', {
      body: { name: 'X', package: 'gold', adminEmail: inviteeEmail() },
    });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.issues).toEqual([
      expect.objectContaining({ path: ['package'] }),
    ]);
    const unknown = await platform().get(`/api/platform/tenants/${w.A.carrierId}`);
    expect(unknown.status).toBe(404);
  });

  it('is not reachable for a tenant admin', async () => {
    const res = await as(app, w.A.users.tenant_admin).get('/api/platform/tenants');
    expect(res.status).toBe(404);
  });
});

describe('PL-02 packages and overrides', () => {
  it('lists the three packages read-only', async () => {
    const res = await platform().get('/api/platform/packages');
    const { items } = (await res.json()) as PackageList;
    expect(items.map((p) => p.id)).toEqual(['start', 'pro', 'enterprise']);
    const limit = (id: string, key: string) =>
      items.find((p) => p.id === id)?.values.find((v) => v.key === key)?.value;
    expect(limit('start', 'core.max_sites')).toBe(1);
    expect(limit('enterprise', 'core.max_sites')).toBeNull();
    expect(items.flatMap((p) => p.values).some((v) => v.key === 'core.sso')).toBe(false);
  });

  it('a raising and a lowering override change a gated answer on the next request', async () => {
    const t = await world({ packages: { A: 'start' } });
    const admin = as(app, t.A.users.tenant_admin);
    const logo = `/api/t/${t.A.tenantId}/brand/logo`;
    expect((await admin.get(logo)).status).toBe(200);
    const off = await as(app, t.platformAdmin).put(overridePath(t.A.tenantId, 'brand.logo'), {
      body: { value: false, note: 'unpaid' },
    });
    expect(off.status).toBe(200);
    const blocked = await admin.get(logo);
    expect(blocked.status).toBe(403);
    expect(await errorOf(blocked)).toMatchObject({
      code: 'entitlement_required',
      details: { key: 'brand.logo' },
    });

    // Start allows 10 internal users; the world has 6 members.
    for (let i = 0; i < 4; i++) expect((await invite(t.A)).status).toBe(201);
    expect((await invite(t.A)).status).toBe(409);
    const raised = await as(app, t.platformAdmin).put(
      overridePath(t.A.tenantId, 'core.max_internal_users'),
      { body: { value: 11 } },
    );
    expect(raised.status).toBe(200);
    expect((await invite(t.A)).status).toBe(201);

    const detail = (await (
      await as(app, t.platformAdmin).get(`/api/platform/tenants/${t.A.tenantId}`)
    ).json()) as TenantDetail;
    expect(detail.entitlements.find((e) => e.key === 'core.max_internal_users')).toMatchObject({
      value: 11,
      source: 'override',
      packageValue: 10,
    });
    expect(detail.overrides).toEqual(
      expect.arrayContaining([
        { key: 'brand.logo', value: false, expiresAt: null, note: 'unpaid', active: true },
      ]),
    );

    const removed = await as(app, t.platformAdmin).delete(overridePath(t.A.tenantId, 'brand.logo'));
    expect(removed.status).toBe(204);
    expect((await admin.get(logo)).status).toBe(200);
  });

  it('an override stops applying at its expiry', async () => {
    const t = await world({ packages: { A: 'start' } });
    for (let i = 0; i < 4; i++) expect((await invite(t.A)).status).toBe(201);
    const expiresAt = new Date(clock.now().getTime() + 3600_000).toISOString();
    await as(app, t.platformAdmin).put(overridePath(t.A.tenantId, 'core.max_internal_users'), {
      body: { value: 20, expiresAt },
    });
    expect((await invite(t.A)).status).toBe(201);
    clock.advance(2 * 3600_000);
    try {
      const res = await invite(t.A);
      expect(res.status).toBe(409);
      expect(await errorOf(res)).toMatchObject({
        code: 'limit_reached',
        details: { key: 'core.max_internal_users', limit: 10 },
      });
      const detail = (await (
        await as(app, t.platformAdmin).get(`/api/platform/tenants/${t.A.tenantId}`)
      ).json()) as TenantDetail;
      expect(detail.overrides).toEqual([expect.objectContaining({ active: false })]);
    } finally {
      clock.set(new Date());
    }
  });

  it('answers 400 for unknown and reserved keys and 422 for a value of the wrong kind', async () => {
    const unknown = await platform().put(overridePath(w.A.tenantId, 'core.max_trucks'), {
      body: { value: 3 },
    });
    expect(unknown.status).toBe(400);
    expect(await errorOf(unknown)).toMatchObject({ details: { reason: 'unknown_key' } });
    const reserved = await platform().put(overridePath(w.A.tenantId, 'core.sso'), {
      body: { value: true },
    });
    expect(reserved.status).toBe(400);
    expect(await errorOf(reserved)).toMatchObject({ details: { reason: 'reserved_key' } });
    const wrongKind = await platform().put(overridePath(w.A.tenantId, 'brand.logo'), {
      body: { value: 5 },
    });
    expect(wrongKind.status).toBe(422);
    expect((await errorOf(wrongKind)).details?.issues).toEqual([
      expect.objectContaining({ path: ['value'] }),
    ]);
  });

  it('changes the package and the name', async () => {
    const t = await world({ packages: { A: 'start' } });
    const res = await as(app, t.platformAdmin).patch(`/api/platform/tenants/${t.A.tenantId}`, {
      body: { package: 'enterprise', name: 'Renamed' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Renamed', package: 'enterprise' });
    const [sub] = await ownerDb()
      .select()
      .from(tenantSubscription)
      .where(eq(tenantSubscription.tenantId, t.A.tenantId));
    expect(sub).toMatchObject({ package: 'enterprise', updatedBy: t.platformAdmin.id });
  });
});

describe('PL-03 platform defaults', () => {
  const settingPath = (key: string) => `/api/platform/settings/${key}`;

  it('lists every platform-scoped key with its value and source', async () => {
    const view = (await (await platform().get('/api/platform/settings')).json()) as SettingsView;
    expect(view.scope).toBe('platform');
    const keys = view.items.map((i) => i.key);
    expect(keys).toContain('privacy.retention.driver_link_hours');
    expect(keys).not.toContain('booking.public_link_enabled');
    expect(view.items.find((i) => i.key === 'booking.horizon_days')).toMatchObject({
      value: 30,
      source: 'default',
    });
  });

  it('answers 422 with the zod issue path for an invalid value', async () => {
    const res = await platform().put(settingPath('booking.slot_grid_minutes'), {
      body: { value: 7 },
    });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).details?.issues).toEqual([
      expect.objectContaining({ path: ['value'] }),
    ]);
    const unknown = await platform().put(settingPath('booking.nope'), { body: { value: 1 } });
    expect(unknown.status).toBe(400);
  });

  it('keeps a tenant override when the platform default changes', async () => {
    const tenantSettings = `/api/t/${w.B.tenantId}/settings`;
    const tenantPut = await as(app, w.B.users.tenant_admin).put(
      `${tenantSettings}/yard.grace_minutes`,
      { body: { siteId: null, value: 20 } },
    );
    expect(tenantPut.status).toBe(200);
    const res = await platform().put(settingPath('yard.grace_minutes'), { body: { value: 25 } });
    expect(res.status).toBe(200);
    expect((await res.json()) as SettingEntry).toMatchObject({ value: 25, source: 'platform' });

    const view = (await (
      await as(app, w.B.users.tenant_admin).get(tenantSettings)
    ).json()) as SettingsView;
    expect(view.items.find((i) => i.key === 'yard.grace_minutes')).toMatchObject({
      value: 20,
      source: 'tenant',
      inherited: { value: 25, source: 'platform' },
    });

    expect((await platform().delete(settingPath('yard.grace_minutes'))).status).toBe(204);
    const rows = await ownerDb()
      .select()
      .from(settingValue)
      .where(and(isNull(settingValue.tenantId), eq(settingValue.key, 'yard.grace_minutes')));
    expect(rows).toEqual([]);
  });
});

describe('PL-04 usage', () => {
  it('counts sites, docks, internal users and bookings this month against limits', async () => {
    const t = await world({ packages: { A: 'start' } });
    await invite(t.A);
    const { items } = (await (
      await as(app, t.platformAdmin).get('/api/platform/tenants')
    ).json()) as TenantList;
    const a = items.find((i) => i.id === t.A.tenantId);
    expect(a?.package).toBe('start');
    expect(a?.usage).toEqual({
      'core.max_sites': { used: 2, limit: 1, soft: false, over: true },
      'core.max_docks': { used: 4, limit: 10, soft: false, over: false },
      'core.max_internal_users': { used: 7, limit: 10, soft: false, over: false },
      'booking.max_bookings_per_month': { used: 3, limit: 1500, soft: true, over: false },
    });
  });

  it('flags a soft limit above 100% and keeps the tenant working', async () => {
    const t = await world({ packages: { A: 'start' } });
    await as(app, t.platformAdmin).put(
      overridePath(t.A.tenantId, 'booking.max_bookings_per_month'),
      { body: { value: 2 } },
    );
    const detail = (await (
      await as(app, t.platformAdmin).get(`/api/platform/tenants/${t.A.tenantId}`)
    ).json()) as TenantDetail;
    expect(detail.usage['booking.max_bookings_per_month']).toEqual({
      used: 3,
      limit: 2,
      soft: true,
      over: true,
    });
    const tenantId: TenantId = t.A.tenantId;
    expect((await invite(t.A)).status).toBe(201);
    expect((await as(app, t.A.users.dispatcher).get(`/api/t/${tenantId}/sites`)).status).toBe(200);
  });
});
