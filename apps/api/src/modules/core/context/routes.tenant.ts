import { catalog, isSettingAvailable, type Role, type SettingKey } from '@rampflow/shared';
import type { ContextSetting, TenantContext } from '@rampflow/shared/modules/core/api.context';
import { tenantStatus } from '@rampflow/shared/modules/core/tenant-status';
import { ScopeParty } from '@rampflow/shared/values';
import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { SiteId } from '../../../db/ids.ts';
import { op, type } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { org, site } from '../schema.ts';

// GET /api/t/:orgId/context: one request per org that the tenant layout gates everything with
// (ADR-0011, "Context and gating"). Gate and dock operators see their assigned sites only (RLS).

const SETTING_KEYS = catalog.flatMap((m) => Object.keys(m.settings)) as SettingKey[];

export const tenant = new Hono<AppEnv>().get(
  '/',
  op({
    id: 'core.context.getTenantContext',
    stories: [],
    description:
      'The tenant context of the signed-in member: org, role, permissions, entitlements, the visible sites and their settings.',
    responses: { 200: type<TenantContext>() },
  }),
  async (c) => {
    const { scope, access, db } = c.var;
    if (scope.party !== ScopeParty.tenant || !access.role || !access.entitlements) {
      throw new Error('context runs under a tenant user scope');
    }
    const { entitlements } = access;
    const [named] = await db
      .select({ id: org.id, name: org.name, activatedAt: org.activatedAt })
      .from(org)
      .where(eq(org.id, scope.tenantId));
    const sites = await db
      .select({ id: site.id, name: site.name, timeZone: site.timeZone })
      .from(site)
      .where(and(eq(site.tenantId, scope.tenantId), eq(site.active, true)))
      .orderBy(asc(site.name));
    const available = SETTING_KEYS.filter((key) => isSettingAvailable(catalog, entitlements, key));
    const settings: TenantContext['settings'] = {};
    for (const s of sites) {
      const values: Partial<Record<SettingKey, ContextSetting>> = {};
      for (const key of available) values[key] = await access.setting(key, s.id as SiteId);
      settings[s.id] = values;
    }
    const body: TenantContext = {
      org: { id: scope.tenantId, name: named?.name ?? '' },
      status: tenantStatus({ activatedAt: named?.activatedAt ?? null }),
      role: access.role as Role,
      permissions: [...access.permissions],
      entitlements,
      sites,
      settings,
    };
    return c.json(body, 200);
  },
);
