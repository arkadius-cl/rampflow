import {
  catalog,
  type EntitlementOverride,
  type Entitlements,
  type PackageId,
  packages,
  parseEntitlementOverride,
  resolveEntitlements,
} from '@rampflow/shared';
import { findEntitlement } from '@rampflow/shared/contract/catalog';
import { ActorParty } from '@rampflow/shared/modules/booking/values';
import {
  type TenantUsage,
  USAGE_KEYS,
  type UsageKey,
} from '@rampflow/shared/modules/core/api.platform';
import { COUNTED_DOCK_STATUSES } from '@rampflow/shared/modules/core/api.sites';
import { SystemActorName } from '@rampflow/shared/values';
import { and, count, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import type { TenantId } from '../../../db/ids.ts';
import { asScope, type Tx } from '../../../db/scope.ts';
import { systemActor } from '../../../kernel/system.ts';
import { booking } from '../../booking/schema.ts';
import { dock, entitlementOverride, invitation, membership, site } from '../schema.ts';
import { isPending } from '../staff/invitations.ts';

// PL-04 for many tenants at once. Entitlements, members and invitations are grouped queries
// under the platform party. Sites, docks and bookings have no platform policy, so each tenant
// costs one statement in the request transaction as that tenant, with the system actor `usage`
// (ADR-0002).

/** The first instant of `now`'s calendar month in UTC. Billing months are UTC months. */
export const monthStart = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export interface TenantRef {
  id: TenantId;
  package: PackageId;
}

export interface Usage {
  entitlements: Entitlements;
  usage: TenantUsage;
}

const isSoft = (key: UsageKey) => {
  const def = findEntitlement(catalog, key)?.def;
  return def?.kind === 'limit' && def.soft === true;
};

/** Resolved entitlements of every tenant from one override query. Stale rows are skipped. */
async function entitlementsOf(tx: Tx, tenants: readonly TenantRef[], now: Date) {
  const rows = await tx
    .select()
    .from(entitlementOverride)
    .where(
      inArray(
        entitlementOverride.tenantId,
        tenants.map((t) => t.id),
      ),
    );
  const overrides = new Map<string, EntitlementOverride[]>();
  for (const row of rows) {
    const parsed = parseEntitlementOverride(catalog, {
      key: row.key,
      value: row.value.v,
      expiresAt: row.expiresAt,
    });
    if (!parsed.ok) continue;
    overrides.set(row.tenantId, [...(overrides.get(row.tenantId) ?? []), parsed.value]);
  }
  return new Map(
    tenants.map((t) => [
      t.id,
      resolveEntitlements(catalog, packages[t.package], overrides.get(t.id) ?? [], now),
    ]),
  );
}

/** Members plus invitations that still work, per tenant (as `core.max_internal_users` counts). */
async function internalUsersOf(tx: Tx, ids: readonly TenantId[], now: Date) {
  const members = await tx
    .select({ id: membership.orgId, n: count() })
    .from(membership)
    .where(and(eq(membership.orgKind, 'tenant'), inArray(membership.orgId, [...ids])))
    .groupBy(membership.orgId);
  const invited = await tx
    .select({ id: invitation.orgId, n: count() })
    .from(invitation)
    .where(and(inArray(invitation.orgId, [...ids]), isPending, gt(invitation.expiresAt, now)))
    .groupBy(invitation.orgId);
  const total = new Map<string, number>();
  for (const r of [...members, ...invited]) total.set(r.id, (total.get(r.id) ?? 0) + r.n);
  return total;
}

/** Sites, docks and bookings this month of one tenant, in one statement under its scope. */
async function tenantCounts(tx: Tx, tenantId: TenantId, now: Date) {
  return asScope(
    tx,
    {
      party: ActorParty.tenant,
      tenantId,
      siteIds: 'all',
      actor: systemActor(SystemActorName.usage),
    },
    async (inner) => {
      const sites = inner
        .select({ n: count() })
        .from(site)
        .where(and(eq(site.tenantId, tenantId), eq(site.active, true)));
      const docks = inner
        .select({ n: count() })
        .from(dock)
        .where(and(eq(dock.tenantId, tenantId), inArray(dock.status, [...COUNTED_DOCK_STATUSES])));
      const bookings = inner
        .select({ n: count() })
        .from(booking)
        .where(and(eq(booking.tenantId, tenantId), gte(booking.createdAt, monthStart(now))));
      const { rows } = await inner.execute<{ sites: number; docks: number; bookings: number }>(
        sql`select (${sites})::int as sites, (${docks})::int as docks, (${bookings})::int as bookings`,
      );
      return rows[0] ?? { sites: 0, docks: 0, bookings: 0 };
    },
  );
}

/** Usage against each tenant's resolved limits. Flags only; nothing here blocks a write. */
export async function usageOf(
  tx: Tx,
  tenants: readonly TenantRef[],
  now: Date,
): Promise<Map<TenantId, Usage>> {
  const out = new Map<TenantId, Usage>();
  if (tenants.length === 0) return out;
  const entitlements = await entitlementsOf(tx, tenants, now);
  const users = await internalUsersOf(
    tx,
    tenants.map((t) => t.id),
    now,
  );
  for (const t of tenants) {
    const counted = await tenantCounts(tx, t.id, now);
    const used: Record<UsageKey, number> = {
      'core.max_sites': counted.sites,
      'core.max_docks': counted.docks,
      'core.max_internal_users': users.get(t.id) ?? 0,
      'booking.max_bookings_per_month': counted.bookings,
    };
    const resolved = entitlements.get(t.id);
    if (!resolved) throw new Error(`no entitlements for ${t.id}`);
    const usage = {} as TenantUsage;
    for (const key of USAGE_KEYS) {
      const limit = resolved.limits[key];
      usage[key] = {
        used: used[key],
        limit,
        soft: isSoft(key),
        over: limit !== null && used[key] > limit,
      };
    }
    out.set(t.id, { entitlements: resolved, usage });
  }
  return out;
}
