import { LoadStatus } from '@rampflow/shared/modules/booking/values';
import {
  CarrierRole,
  ScopeParty,
  SystemActorName,
  TenantActorKind,
  values,
} from '@rampflow/shared/values';
import { and, eq, inArray, isNull, ne, or, type SQL } from 'drizzle-orm';
import type { BookingId, CarrierId, SiteId, TenantId, UserId } from '../../../db/ids.ts';
import { oneOf } from '../../../db/ids.ts';
// biome-ignore lint/style/noRestrictedImports: the three reads below need rows the acting party's RLS hides; each returns only what its caller may learn (U6a report)
import { asScope, type Tx } from '../../../db/scope.ts';
import { avisReference } from '../../avis/schema.ts';
import { appUser, membership, org } from '../../core/schema.ts';
import { booking } from '../schema.ts';

// Reads across a party boundary, in the request transaction (ADR-0002, like the capacity read
// of ADR-0004). Nothing else in the booking module switches scope.

export interface Recipient {
  email: string;
  locale: string | null;
}

/**
 * Every `carrier_admin` of a carrier: the booking contact of a staff booking (booking lifecycle,
 * "Booking contact"). A tenant sees its linked carriers' users but not their memberships, so
 * the membership read runs as that carrier.
 */
export function carrierAdmins(tx: Tx, carrierId: CarrierId, asUser: UserId): Promise<Recipient[]> {
  return asScope(
    tx,
    { party: ScopeParty.carrier, carrierId, userId: asUser, role: CarrierRole.carrier_admin },
    (inner) =>
      inner
        .select({ email: appUser.email, locale: appUser.locale })
        .from(membership)
        .innerJoin(appUser, eq(appUser.id, membership.userId))
        .where(
          and(
            eq(membership.orgId, carrierId),
            eq(membership.orgKind, 'carrier'),
            eq(membership.role, 'carrier_admin'),
            isNull(appUser.disabledAt),
          ),
        ),
  );
}

/** Company names of carriers the caller already knows by id (its active links). */
export async function carrierNames(
  tx: Tx,
  ids: readonly CarrierId[],
): Promise<Map<CarrierId, string>> {
  if (ids.length === 0) return new Map();
  const rows = await asScope(
    tx,
    { party: ScopeParty.system, job: SystemActorName.booking_carrier_names },
    (inner) =>
      inner
        .select({ id: org.id, name: org.name })
        .from(org)
        .where(and(inArray(org.id, [...ids]), eq(org.kind, 'carrier'))),
  );
  return new Map(rows.map((r) => [r.id as CarrierId, r.name]));
}

/**
 * `avis.unique_references`: whether an active booking of the site already carries one of these
 * references. A carrier cannot see other carriers' avis, so the read runs as the tenant and
 * answers only yes or no.
 */
export async function referenceTaken(
  tx: Tx,
  where: {
    tenantId: TenantId;
    siteId: SiteId;
    references: readonly { type: string; valueNorm: string }[];
    excludeBookingId: BookingId | null;
  },
): Promise<boolean> {
  if (where.references.length === 0) return false;
  const matches: SQL[] = where.references.map(
    (r) =>
      and(eq(avisReference.type, r.type as never), eq(avisReference.valueNorm, r.valueNorm)) as SQL,
  );
  const rows = await asScope(
    tx,
    {
      party: ScopeParty.tenant,
      tenantId: where.tenantId,
      siteIds: 'all',
      actor: { kind: TenantActorKind.system, job: SystemActorName.avis_unique_references },
    },
    (inner) =>
      inner
        .select({ id: avisReference.id })
        .from(avisReference)
        .innerJoin(booking, eq(booking.id, avisReference.bookingId))
        .where(
          and(
            eq(avisReference.tenantId, where.tenantId),
            eq(avisReference.siteId, where.siteId),
            or(...matches),
            oneOf(booking.status, values(LoadStatus)),
            where.excludeBookingId ? ne(booking.id, where.excludeBookingId) : undefined,
          ),
        )
        .limit(1),
  );
  return rows.length > 0;
}
