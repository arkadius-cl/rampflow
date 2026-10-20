import { randomUUID } from 'node:crypto';
import {
  Feature,
  Limit,
  Module,
  PackageId,
  Permission,
  ScopeParty,
  Setting,
  TenantActorKind,
  TenantRole,
} from '@rampflow/shared/values';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../test/db.ts';
import { as } from '../../test/http.ts';
import { type World, world } from '../../test/world.ts';
import { type SiteId, wrapJson } from '../db/ids.ts';
import { type Scope, withScope } from '../db/scope.ts';
import { entitlementOverride, invitation, settingValue } from '../modules/core/schema.ts';
import {
  loadAccess,
  requireEntitlement,
  requireModule,
  requirePermission,
  withinLimit,
  withModule,
} from './access.ts';
import { systemClock } from './clock.ts';
import type { AppEnv } from './env.ts';
import { onError } from './errors.ts';
import { scoped } from './scoped.ts';
import { tenantScope } from './scopes.ts';

let w: World;
beforeAll(async () => {
  w = await world({ packages: { A: PackageId.start, B: PackageId.pro } });
});

const tenantOf = (
  side: World['A'],
  userKey: 'dispatcher' | 'tenant_admin' = TenantRole.dispatcher,
): Scope => ({
  party: ScopeParty.tenant,
  tenantId: side.tenantId,
  siteIds: 'all',
  actor: { kind: TenantActorKind.user, userId: side.users[userKey].id, role: userKey },
});

const override = (tenantId: World['A']['tenantId'], key: string, value: unknown) =>
  ownerDb()
    .insert(entitlementOverride)
    .values({ tenantId, key, value: wrapJson(value), updatedBy: w.platformAdmin.id })
    .onConflictDoUpdate({
      target: [entitlementOverride.tenantId, entitlementOverride.key],
      set: { value: wrapJson(value) },
    });

function gatedApp() {
  const yard = new Hono<AppEnv>()
    .get('/gate', requirePermission(Permission.yard.gate), (c) => c.json({ ok: true }))
    .get(
      '/docks',
      requirePermission(Permission.yard.call),
      requireEntitlement(Feature.yard.call_to_dock),
      (c) => c.json({ ok: true }),
    );
  const tenant = new Hono<AppEnv>()
    .use(scoped(tenantScope))
    .route('/yard', withModule(Module.yard, yard))
    .get('/report', requireModule(Module.report), (c) => c.json({ ok: true }));
  return new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('clock', systemClock);
      await next();
    })
    .route('/api/t/:orgId', tenant)
    .onError(onError);
}

describe('access middleware', () => {
  it('answers 403 forbidden without the permission', async () => {
    const res = await as(gatedApp(), w.A.users.dock_operator).get(
      `/api/t/${w.A.tenantId}/yard/gate`,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: 'forbidden', message: 'Missing yard.gate' },
    });
    const ok = await as(gatedApp(), w.A.users.gate_operator).get(
      `/api/t/${w.A.tenantId}/yard/gate`,
    );
    expect(ok.status).toBe(200);
  });

  it('answers 403 entitlement_required with the feature key when a route feature is off', async () => {
    await override(w.A.tenantId, 'yard.call_to_dock', false);
    const res = await as(gatedApp(), w.A.users.dock_operator).get(
      `/api/t/${w.A.tenantId}/yard/docks`,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: { code: 'entitlement_required', details: { key: 'yard.call_to_dock' } },
    });
  });

  it('answers 403 entitlement_required with the blocking feature when the module is off', async () => {
    await override(w.B.tenantId, 'yard.checkin_qr', false);
    const res = await as(gatedApp(), w.B.users.gate_operator).get(
      `/api/t/${w.B.tenantId}/yard/gate`,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: { code: 'entitlement_required', details: { key: 'yard.checkin_qr' } },
    });
    // report depends on yard: its blocking feature is yard's enabling feature.
    const report = await as(gatedApp(), w.B.users.dispatcher).get(`/api/t/${w.B.tenantId}/report`);
    expect(await report.json()).toMatchObject({ error: { details: { key: 'yard.checkin_qr' } } });
  });
});

describe('loadAccess', () => {
  it('stores JSON null: an override to unlimited and a setting cleared to null round-trip', async () => {
    await override(w.B.tenantId, 'core.max_sites', null);
    await ownerDb()
      .insert(settingValue)
      .values({
        tenantId: w.B.tenantId,
        key: 'privacy.notice_url',
        value: wrapJson(null),
        updatedBy: w.platformAdmin.id,
      });
    await ownerDb()
      .insert(settingValue)
      .values({
        tenantId: null,
        key: 'privacy.notice_url',
        value: wrapJson('https://platform.test/privacy'),
        updatedBy: w.platformAdmin.id,
      })
      .onConflictDoNothing();
    const access = await withScope(tenantOf(w.B), (tx) =>
      loadAccess(tx, tenantOf(w.B), systemClock),
    );
    expect(access.entitlements?.limits['core.max_sites']).toBeNull();
    expect(access.entitlements?.sources['core.max_sites']).toBe('override');
    expect(
      await withScope(tenantOf(w.B), (tx) =>
        loadAccess(tx, tenantOf(w.B), systemClock).then((a) =>
          a.setting(Setting.privacy.notice_url, null),
        ),
      ),
    ).toEqual({ value: null, source: 'tenant' });
  });

  it('resolves a site value over the tenant value', async () => {
    const siteId = w.B.sites[1].id as SiteId;
    await ownerDb()
      .insert(settingValue)
      .values([
        {
          tenantId: w.B.tenantId,
          key: 'yard.grace_minutes',
          value: wrapJson(20),
          updatedBy: w.platformAdmin.id,
        },
        {
          tenantId: w.B.tenantId,
          siteId,
          key: 'yard.grace_minutes',
          value: wrapJson(25),
          updatedBy: w.platformAdmin.id,
        },
      ]);
    const resolved = await withScope(tenantOf(w.B), async (tx) => {
      const access = await loadAccess(tx, tenantOf(w.B), systemClock);
      return [
        await access.setting(Setting.yard.grace_minutes, siteId),
        await access.setting(Setting.yard.grace_minutes, w.B.sites[0].id),
      ];
    });
    expect(resolved).toEqual([
      { value: 25, source: 'site' },
      { value: 20, source: 'tenant' },
    ]);
  });
});

describe('withinLimit', () => {
  it('lets exactly one of two concurrent writes at limit - 1 through', async () => {
    const tenantId = w.A.tenantId;
    const countStaff = async (tx: Parameters<Parameters<typeof withScope>[1]>[0]) => {
      const { rows } = await tx.execute<{ n: number }>(sql`
        select (select count(*) from membership where org_id = ${tenantId})::int
             + (select count(*) from invitation where org_id = ${tenantId} and accepted_at is null)::int as n`);
      return rows[0]?.n ?? 0;
    };
    const before = await withScope(tenantOf(w.A, TenantRole.tenant_admin), countStaff);
    await override(tenantId, 'core.max_internal_users', before + 1);
    const invite = () =>
      withScope(tenantOf(w.A, TenantRole.tenant_admin), async (tx) => {
        const access = await loadAccess(tx, tenantOf(w.A, TenantRole.tenant_admin), systemClock);
        if (!access.entitlements) throw new Error('no entitlements');
        await withinLimit(
          tx,
          tenantId,
          access.entitlements,
          Limit.core.max_internal_users,
          async (inner) => {
            const n = await countStaff(inner);
            await new Promise((r) => setTimeout(r, 100));
            return n;
          },
        );
        await tx.insert(invitation).values({
          orgId: tenantId,
          orgKind: 'tenant',
          email: `limit-${randomUUID()}@access.test`,
          role: 'dispatcher',
          tokenHash: Buffer.from(randomUUID()),
          expiresAt: new Date(Date.now() + 3600_000),
        });
      });
    const results = await Promise.allSettled([invite(), invite()]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({
      code: 'limit_reached',
      details: { key: 'core.max_internal_users', limit: before + 1 },
    });
    expect(await withScope(tenantOf(w.A, TenantRole.tenant_admin), countStaff)).toBe(before + 1);
    await ownerDb()
      .delete(entitlementOverride)
      .where(eq(entitlementOverride.key, 'core.max_internal_users'));
  });
});
