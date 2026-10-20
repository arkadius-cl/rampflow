import { randomUUID } from 'node:crypto';
import { Feature, HttpMethod, Permission, Role } from '@rampflow/shared/values';
import type { OwnerDb } from '../../../../test/db.ts';
import { defineRouteCases } from '../../../../test/route-cases.ts';
import type { World, WorldSide } from '../../../../test/world.ts';
import { closure, loadTypeResource } from '../schema.resources.ts';

/** Per world: one manual closure and one holiday closure on site 0 of each side. */
const closures = new WeakMap<World, { manual: string; holiday: string }>();

async function closureFixtures(w: World, db: OwnerDb): Promise<void> {
  const ids = { manual: randomUUID(), holiday: randomUUID() };
  for (const side of [w.A, w.B]) {
    const own = side === w.A;
    const base = { tenantId: side.tenantId, siteId: side.sites[0].id, kind: 'closed' as const };
    await db.insert(closure).values([
      {
        ...base,
        id: own ? (ids.manual as never) : undefined,
        startsLocal: '2026-11-11T06:00',
        endsLocal: '2026-11-11T10:00',
        source: 'manual',
      },
      {
        ...base,
        id: own ? (ids.holiday as never) : undefined,
        startsLocal: '2026-12-25T00:00',
        endsLocal: '2026-12-26T00:00',
        source: 'holiday',
        holidayDate: '2026-12-25',
        holidayName: '1. Weihnachtstag',
      },
    ]);
  }
  closures.set(w, ids);
}

const closureOf = (w: World) => {
  const ids = closures.get(w);
  if (!ids) throw new Error('closure fixtures missing');
  return ids;
};

async function eligibility(w: World, db: OwnerDb): Promise<void> {
  const link = (s: WorldSide) => ({
    loadTypeId: s.sites[0].loadTypeId,
    resourceId: s.sites[0].resourceId,
    siteId: s.sites[0].id,
    tenantId: s.tenantId,
  });
  await db.insert(loadTypeResource).values([link(w.A), link(w.B)]);
}

const site0 = (w: World) => ({ siteId: w.A.sites[0].id });
const tiers = {
  kind: 'tiers',
  tiers: [
    { upTo: 16, minutes: 30 },
    { upTo: null, minutes: 60 },
  ],
};

export const cases = defineRouteCases([
  {
    method: HttpMethod.GET,
    path: '/api/t/:orgId/capacity/resources',
    as: Role.dock_operator,
    permission: Permission.booking.view,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    query: site0,
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.POST,
    path: '/api/t/:orgId/capacity/resources',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: Feature.booking.pools,
    params: (w) => ({ orgId: w.A.tenantId }),
    body: (w) => ({
      siteId: w.A.sites[0].id,
      kind: 'pool',
      name: 'Rampen 1-2',
      directions: ['inbound'],
      dockIds: [...w.A.sites[0].dockIds],
    }),
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.PATCH,
    path: '/api/t/:orgId/capacity/resources/:resourceId',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: Feature.booking.pools,
    params: (w) => ({ orgId: w.A.tenantId, resourceId: w.A.sites[0].resourceId }),
    body: () => ({ capacityCap: 1 }),
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.PUT,
    path: '/api/t/:orgId/capacity/resources/:resourceId/docks',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: Feature.booking.pools,
    params: (w) => ({ orgId: w.A.tenantId, resourceId: w.A.sites[0].resourceId }),
    body: (w) => ({ dockIds: [...w.A.sites[0].dockIds] }),
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.PUT,
    path: '/api/t/:orgId/capacity/docks/:dockId/booking',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: Feature.booking.pools,
    params: (w) => ({ orgId: w.A.tenantId, dockId: w.A.sites[0].dockIds[0] }),
    body: (w) => ({ as: 'pool', resourceId: w.A.sites[0].resourceId }),
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.GET,
    path: '/api/t/:orgId/capacity/hours',
    as: Role.gate_operator,
    permission: Permission.booking.view,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    query: site0,
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.PUT,
    path: '/api/t/:orgId/capacity/hours',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    body: (w) => ({
      siteId: w.A.sites[0].id,
      resourceId: null,
      rows: [{ weekday: 1, opens: '06:00', closes: '22:00' }],
    }),
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.GET,
    path: '/api/t/:orgId/capacity/closures',
    as: Role.dock_operator,
    permission: Permission.booking.view,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    query: (w) => ({ ...site0(w), from: '2026-11-01', to: '2026-12-31' }),
    setup: closureFixtures,
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.POST,
    path: '/api/t/:orgId/capacity/closures',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    body: (w) => ({
      siteId: w.A.sites[0].id,
      resourceId: w.A.sites[0].resourceId,
      kind: 'blocked',
      startsLocal: '2026-11-12T08:00',
      endsLocal: '2026-11-12T12:00',
      reason: 'Inventur',
    }),
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.DELETE,
    path: '/api/t/:orgId/capacity/closures/:closureId',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId, closureId: closureOf(w).manual }),
    setup: closureFixtures,
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.POST,
    path: '/api/t/:orgId/capacity/closures/:closureId/reopen',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId, closureId: closureOf(w).holiday }),
    setup: closureFixtures,
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.GET,
    path: '/api/t/:orgId/capacity/load-types',
    as: Role.dock_operator,
    permission: Permission.booking.view,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    query: site0,
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.POST,
    path: '/api/t/:orgId/capacity/load-types',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: Feature.booking.duration_rules,
    params: (w) => ({ orgId: w.A.tenantId }),
    body: (w) => ({
      siteId: w.A.sites[0].id,
      name: { de: 'Kühlware', en: 'Chilled goods' },
      direction: 'inbound',
      duration: tiers,
      bufferMinutes: 15,
      resourceIds: [w.A.sites[0].resourceId],
    }),
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.PATCH,
    path: '/api/t/:orgId/capacity/load-types/:loadTypeId',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: Feature.booking.duration_rules,
    params: (w) => ({ orgId: w.A.tenantId, loadTypeId: w.A.sites[0].loadTypeId }),
    body: () => ({ duration: tiers }),
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.PUT,
    path: '/api/t/:orgId/capacity/load-types/:loadTypeId/resources',
    as: Role.tenant_admin,
    permission: Permission.booking.manage_resources,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId, loadTypeId: w.A.sites[0].loadTypeId }),
    body: (w) => ({ resourceIds: [w.A.sites[0].resourceId] }),
    foreign: 'not_found',
    siteScoped: true,
  },
  {
    method: HttpMethod.GET,
    path: '/api/t/:orgId/capacity/availability',
    as: Role.dock_operator,
    permission: Permission.booking.view,
    entitlement: null,
    params: (w) => ({ orgId: w.A.tenantId }),
    query: (w) => ({
      siteId: w.A.sites[0].id,
      date: '2026-11-02',
      loadTypeId: w.A.sites[0].loadTypeId,
      loadUnits: '10',
    }),
    setup: eligibility,
    foreign: 'not_found',
    siteScoped: true,
  },
]);
