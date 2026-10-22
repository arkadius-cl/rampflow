import { catalog, permissionsFor } from '@rampflow/shared';
import { CarrierLinkStatus } from '@rampflow/shared/modules/booking/values';
import type {
  CarrierContext,
  PlatformContext,
  TenantContext,
} from '@rampflow/shared/modules/core/api.context';
import { TenantStatus } from '@rampflow/shared/modules/core/values';
import { Feature, Limit, PackageId, Role, SettingSource } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../../../../test/db.ts';
import { as } from '../../../../test/http.ts';
import { onboardingTenant, type World, world } from '../../../../test/world.ts';
import { app } from '../../../app.ts';
import { wrapJson } from '../../../db/ids.ts';
import { onboardingSteps } from '../onboarding/fixtures.ts';
import { entitlementOverride, org, tenantCarrierLink } from '../schema.ts';

// The three context endpoints that the web layouts gate routes, navigation and actions with.

let w: World;
beforeAll(async () => {
  w = await world({ packages: { A: PackageId.pro, B: PackageId.start } });
});

const json = async <T>(res: Response) => {
  expect(res.status).toBe(200);
  return (await res.json()) as T;
};

describe('GET /api/t/:orgId/context', () => {
  it('answers status onboarding before the first dock and active after it (ON-02)', async () => {
    const t = await onboardingTenant();
    const status = async () =>
      (
        await json<TenantContext>(
          await as(app, t.users.dispatcher).get(`/api/t/${t.tenantId}/context`),
        )
      ).status;
    const steps = onboardingSteps(app, t.users.tenant_admin, t.tenantId);
    const siteId = await steps.site();
    const hallId = await steps.hall(siteId);
    expect(await status()).toBe(TenantStatus.onboarding);
    expect((await steps.dock(siteId, hallId)).status).toBe(201);
    expect(await status()).toBe(TenantStatus.active);
  });

  it("returns the role's permissions, the tenant's entitlements, sites and site settings", async () => {
    const ctx = await json<TenantContext>(
      await as(app, w.A.users.dispatcher).get(`/api/t/${w.A.tenantId}/context`),
    );
    expect(ctx.org.id).toBe(w.A.tenantId);
    expect(ctx.role).toBe('dispatcher');
    expect(new Set(ctx.permissions)).toEqual(permissionsFor(catalog, Role.dispatcher));
    expect(ctx.entitlements.limits[Limit.core.max_sites]).toBe(5);
    expect(ctx.entitlements.features[Feature.safety.quiz]).toBe(true);
    expect(ctx.sites.map((s) => s.id).sort()).toEqual(w.A.sites.map((s) => s.id).sort());
    const site = ctx.settings[w.A.sites[0].id];
    expect(site?.['booking.slot_grid_minutes']).toEqual({
      value: 30,
      source: SettingSource.default,
    });
    expect(site?.['safety.quiz_pass_percent']).toEqual({
      value: 100,
      source: SettingSource.default,
    });
  });

  it('leaves out settings whose entitlement is off (start has no quiz)', async () => {
    const ctx = await json<TenantContext>(
      await as(app, w.B.users.tenant_admin).get(`/api/t/${w.B.tenantId}/context`),
    );
    expect(ctx.entitlements.features[Feature.safety.quiz]).toBe(false);
    const site = ctx.settings[w.B.sites[0].id] ?? {};
    expect(Object.keys(site)).not.toContain('safety.quiz_pass_percent');
    expect(Object.keys(site)).toContain('booking.horizon_days');
  });

  it('gives a gate operator only the assigned site', async () => {
    const ctx = await json<TenantContext>(
      await as(app, w.A.users.gate_operator_other_site).get(`/api/t/${w.A.tenantId}/context`),
    );
    expect(ctx.sites.map((s) => s.id)).toEqual([w.A.sites[1].id]);
    expect(Object.keys(ctx.settings)).toEqual([w.A.sites[1].id]);
  });

  it('answers 404 to a carrier user and to a tenant user of another tenant', async () => {
    expect(
      (await as(app, w.A.users.carrier_admin).get(`/api/t/${w.A.tenantId}/context`)).status,
    ).toBe(404);
    expect(
      (await as(app, w.B.users.tenant_admin).get(`/api/t/${w.A.tenantId}/context`)).status,
    ).toBe(404);
  });
});

describe('GET /api/c/:orgId/context', () => {
  it('lists linked tenants with link status and the carrier portal entitlement', async () => {
    const tenant = (await world()).A;
    await ownerDb()
      .update(tenantCarrierLink)
      .set({ status: CarrierLinkStatus.deactivated, deactivatedAt: new Date() })
      .where(
        and(
          eq(tenantCarrierLink.tenantId, tenant.tenantId),
          eq(tenantCarrierLink.carrierId, tenant.carrierId),
        ),
      );
    await ownerDb()
      .insert(entitlementOverride)
      .values({
        tenantId: tenant.tenantId,
        key: 'booking.carrier_portal',
        value: wrapJson(false),
        updatedBy: tenant.users.tenant_admin.id,
      });
    const ctx = await json<CarrierContext>(
      await as(app, tenant.users.carrier_admin).get(`/api/c/${tenant.carrierId}/context`),
    );
    expect(ctx.role).toBe('carrier_admin');
    expect(ctx.permissions).toContain('core.manage_carrier_users');
    expect(ctx.tenants).toEqual([
      {
        id: tenant.tenantId,
        name: expect.any(String),
        linkStatus: 'deactivated',
        carrierPortal: false,
        suspended: false,
        logoUrl: null,
      },
    ]);
  });

  it('shows the portal on for a tenant whose package includes it', async () => {
    const ctx = await json<CarrierContext>(
      await as(app, w.A.users.carrier_user).get(`/api/c/${w.A.carrierId}/context`),
    );
    expect(ctx.tenants.map((t) => [t.id, t.linkStatus, t.carrierPortal])).toEqual([
      [w.A.tenantId, 'active', true],
    ]);
    expect(ctx.permissions).not.toContain('core.manage_carrier_users');
  });

  it('marks a suspended tenant with the carrier portal off (PL-07)', async () => {
    const tenant = (await world()).A;
    const row = eq(org.id, tenant.tenantId);
    await ownerDb().update(org).set({ suspendedAt: new Date() }).where(row);
    try {
      const ctx = await json<CarrierContext>(
        await as(app, tenant.users.carrier_user).get(`/api/c/${tenant.carrierId}/context`),
      );
      expect(ctx.tenants).toEqual([
        expect.objectContaining({
          id: tenant.tenantId,
          linkStatus: CarrierLinkStatus.active,
          carrierPortal: false,
          suspended: true,
        }),
      ]);
    } finally {
      await ownerDb().update(org).set({ suspendedAt: null }).where(row);
    }
  });
});

describe('GET /api/platform/context', () => {
  it('answers platform admins with their permissions and everyone else with 404', async () => {
    const ctx = await json<PlatformContext>(
      await as(app, w.platformAdmin).get('/api/platform/context'),
    );
    expect(new Set(ctx.permissions)).toEqual(permissionsFor(catalog, Role.platform_admin));
    expect((await as(app, w.A.users.tenant_admin).get('/api/platform/context')).status).toBe(404);
    expect((await as(app, null).get('/api/platform/context')).status).toBe(401);
  });
});
