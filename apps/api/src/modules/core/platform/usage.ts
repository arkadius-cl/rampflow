import type { Entitlements } from '@rampflow/shared';
import { catalog } from '@rampflow/shared';
import { findEntitlement } from '@rampflow/shared/contract/catalog';
import {
  type TenantUsage,
  USAGE_KEYS,
  type UsageKey,
} from '@rampflow/shared/modules/core/api.platform';
import { COUNTED_DOCK_STATUSES } from '@rampflow/shared/modules/core/api.sites';
import { and, count, eq, gte, inArray } from 'drizzle-orm';
import type { TenantId } from '../../../db/ids.ts';
import { asScope, type Tx } from '../../../db/scope.ts';
import { systemActor } from '../../../kernel/system.ts';
import { booking } from '../../booking/schema.ts';
import { dock, site } from '../schema.ts';
import { countInternalUsers } from '../staff/members.ts';

// PL-04. The platform party sees no tenant rows, so the counts run in the request transaction
// as the tenant, with the system actor `usage` (ADR-0002).

/** The first instant of `now`'s calendar month in UTC. Billing months are UTC months. */
export const monthStart = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

async function counts(tx: Tx, tenantId: TenantId, now: Date): Promise<Record<UsageKey, number>> {
  const [sites] = await tx
    .select({ n: count() })
    .from(site)
    .where(and(eq(site.tenantId, tenantId), eq(site.active, true)));
  const [docks] = await tx
    .select({ n: count() })
    .from(dock)
    .where(and(eq(dock.tenantId, tenantId), inArray(dock.status, [...COUNTED_DOCK_STATUSES])));
  const [bookings] = await tx
    .select({ n: count() })
    .from(booking)
    .where(and(eq(booking.tenantId, tenantId), gte(booking.createdAt, monthStart(now))));
  return {
    'core.max_sites': sites?.n ?? 0,
    'core.max_docks': docks?.n ?? 0,
    'core.max_internal_users': await countInternalUsers(tx, tenantId, now),
    'booking.max_bookings_per_month': bookings?.n ?? 0,
  };
}

const isSoft = (key: UsageKey) => {
  const def = findEntitlement(catalog, key)?.def;
  return def?.kind === 'limit' && def.soft === true;
};

/** Usage against the tenant's resolved limits. Flags only; nothing here blocks a write. */
export async function tenantUsage(
  tx: Tx,
  tenantId: TenantId,
  entitlements: Entitlements,
  now: Date,
): Promise<TenantUsage> {
  const used = await asScope(
    tx,
    { party: 'tenant', tenantId, siteIds: 'all', actor: systemActor('usage') },
    (inner) => counts(inner, tenantId, now),
  );
  const usage = {} as TenantUsage;
  for (const key of USAGE_KEYS) {
    const limit = entitlements.limits[key];
    usage[key] = {
      used: used[key],
      limit,
      soft: isSoft(key),
      over: limit !== null && used[key] > limit,
    };
  }
  return usage;
}
