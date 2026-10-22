import type { ListStateOf } from '@rampflow/shared/contract/list';
import type { OnboardingView } from '@rampflow/shared/modules/core/api.onboarding';
import type {
  PlatformSiteList,
  PlatformSiteListQuery,
} from '@rampflow/shared/modules/core/api.platform';
import { CountedDockStatus } from '@rampflow/shared/modules/core/values';
import { ScopeParty, SystemActorName, values, YesNo } from '@rampflow/shared/values';
import { and, count, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { TenantId } from '../../../db/ids.ts';
import { asScope, type Scope, type Tx } from '../../../db/scope.ts';
import { contains, facetCounts, orderBy, pageOf, pageWindow } from '../../../kernel/list.ts';
import { systemActor } from '../../../kernel/system.ts';
import { onboardingView } from '../onboarding/onboarding.ts';
import { dock, hall, site } from '../schema.ts';

// PL-06: the tenant hub's reads of tenant master data. Sites, halls and docks have no platform
// policy, so each read switches to the tenant's scope with the actor `system:platform_read`
// (ADR-0002, design decision 4). Master data only: no booking, carrier, visit or person.

const asTenant = (tenantId: TenantId): Scope => ({
  party: ScopeParty.tenant,
  tenantId,
  siteIds: 'all',
  actor: systemActor(SystemActorName.platform_read),
});

export type PlatformSiteListState = ListStateOf<typeof PlatformSiteListQuery>;

const ACTIVE_WHERE: Record<YesNo, SQL> = {
  [YesNo.yes]: eq(site.active, true),
  [YesNo.no]: eq(site.active, false),
};

/** The Sites tab: one page of sites with their hall and counted dock numbers. */
export function siteList(
  tx: Tx,
  tenantId: TenantId,
  state: PlatformSiteListState,
): Promise<PlatformSiteList> {
  return asScope(tx, asTenant(tenantId), async (inner) => {
    const halls = inner
      .select({ siteId: hall.siteId, n: count().as('halls') })
      .from(hall)
      .where(eq(hall.tenantId, tenantId))
      .groupBy(hall.siteId)
      .as('halls');
    const docks = inner
      .select({ siteId: dock.siteId, n: count().as('docks') })
      .from(dock)
      .where(and(eq(dock.tenantId, tenantId), inArray(dock.status, values(CountedDockStatus))))
      .groupBy(dock.siteId)
      .as('docks');
    const searched = and(eq(site.tenantId, tenantId), contains(state.q, site.name, site.city));
    const active =
      state.active.length > 0
        ? inArray(
            site.active,
            state.active.map((v) => v === YesNo.yes),
          )
        : undefined;
    const where = and(searched, active);
    const [counts] = await inner
      .select({
        total: sql<number>`(count(*) filter (where ${active ?? sql`true`}))::int`,
        [YesNo.yes]: sql<number>`(count(*) filter (where ${ACTIVE_WHERE.yes}))::int`,
        [YesNo.no]: sql<number>`(count(*) filter (where ${ACTIVE_WHERE.no}))::int`,
      })
      .from(site)
      .where(searched);
    const { limit, offset } = pageWindow(state);
    const rows = await inner
      .select({
        id: site.id,
        name: site.name,
        city: site.city,
        country: site.country,
        timeZone: site.timeZone,
        active: site.active,
        halls: sql<number>`coalesce(${halls.n}, 0)::int`,
        docks: sql<number>`coalesce(${docks.n}, 0)::int`,
        createdAt: site.createdAt,
      })
      .from(site)
      .leftJoin(halls, eq(halls.siteId, site.id))
      .leftJoin(docks, eq(docks.siteId, site.id))
      .where(where)
      .orderBy(
        ...orderBy(state, { name: site.name, city: site.city, createdAt: site.createdAt }, site.id),
      )
      .limit(limit)
      .offset(offset);
    return {
      ...pageOf(
        state,
        counts?.total ?? 0,
        rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      ),
      facets: {
        active: facetCounts(
          values(YesNo),
          values(YesNo).map((v) => ({ value: v, count: counts?.[v] ?? 0 })),
        ),
      },
    };
  });
}

/** 03's onboarding checklist, read as the tenant. */
export function onboardingOf(tx: Tx, tenantId: TenantId): Promise<OnboardingView> {
  return asScope(tx, asTenant(tenantId), (inner) => onboardingView(inner, tenantId));
}
