import type {
  CarrierLinkSource,
  CarrierLinkView,
} from '@rampflow/shared/modules/booking/api.carriers';
import { CarrierLinkStatus } from '@rampflow/shared/modules/booking/values';
import { ErrorCode } from '@rampflow/shared/values';
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { AnyOrgId, CarrierId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { org, tenantCarrierLink } from '../../core/schema.ts';

// The link between a tenant and a carrier (TN-03). Booking creation and reschedules check it with
// assertActiveLink; reads never do, so a deactivated carrier still sees its existing bookings.

/**
 * Throws 403 `forbidden` with reason `link_inactive` unless the carrier's link to the tenant is
 * active. U8 calls it before creating or moving a booking; cancel and reads skip it.
 */
export async function assertActiveLink(
  tx: Tx,
  tenantId: TenantId,
  carrierId: CarrierId,
): Promise<void> {
  const [link] = await tx
    .select({ status: tenantCarrierLink.status })
    .from(tenantCarrierLink)
    .where(
      and(eq(tenantCarrierLink.tenantId, tenantId), eq(tenantCarrierLink.carrierId, carrierId)),
    );
  if (link?.status !== CarrierLinkStatus.active) {
    throw new ApiError(ErrorCode.forbidden, 'The carrier link is not active', {
      reason: 'link_inactive',
    });
  }
}

/**
 * Links a carrier to a tenant. A tenant decision reactivates a link deactivated before it was
 * made: an approval now, an invitation when it was sent. So a stale invitation cannot undo a
 * later deactivation, and an automatic approval (`reactivateDeactivatedBefore: null`) never does:
 * a carrier the tenant switched off cannot switch itself back on through the public link.
 */
export async function linkCarrier(
  tx: Tx,
  o: {
    tenantId: TenantId;
    carrierId: CarrierId;
    source: CarrierLinkSource;
    reactivateDeactivatedBefore: Date | null;
  },
): Promise<void> {
  const insert = tx
    .insert(tenantCarrierLink)
    .values({ tenantId: o.tenantId, carrierId: o.carrierId, status: 'active', source: o.source });
  await (o.reactivateDeactivatedBefore
    ? insert.onConflictDoUpdate({
        target: [tenantCarrierLink.tenantId, tenantCarrierLink.carrierId],
        set: { status: 'active', deactivatedAt: null },
        setWhere: lt(tenantCarrierLink.deactivatedAt, o.reactivateDeactivatedBefore),
      })
    : insert.onConflictDoNothing());
}

/** The tenant's linked carriers with name and country, newest first. */
export async function listLinks(
  tx: Tx,
  tenantId: TenantId,
  carrierIds?: readonly CarrierId[],
): Promise<CarrierLinkView[]> {
  const links = await tx
    .select()
    .from(tenantCarrierLink)
    .where(
      and(
        eq(tenantCarrierLink.tenantId, tenantId),
        carrierIds ? inArray(tenantCarrierLink.carrierId, [...carrierIds]) : undefined,
      ),
    );
  const names = await orgNames(
    tx,
    links.map((l) => l.carrierId),
  );
  return links
    .map((l) => {
      const carrier = names.get(l.carrierId);
      return {
        carrierId: l.carrierId,
        name: carrier?.name ?? '',
        country: carrier?.country ?? null,
        status: l.status,
        source: l.source,
        linkedAt: l.createdAt.toISOString(),
        deactivatedAt: l.deactivatedAt?.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.linkedAt.localeCompare(a.linkedAt));
}

/** TN-03: deactivating blocks new bookings at once; activating lifts it. 404 without a link. */
export async function setLinkStatus(
  tx: Tx,
  tenantId: TenantId,
  carrierId: CarrierId,
  status: CarrierLinkStatus,
  now: Date,
): Promise<CarrierLinkView> {
  const updated = await tx
    .update(tenantCarrierLink)
    .set({ status, deactivatedAt: status === CarrierLinkStatus.deactivated ? now : null })
    .where(
      and(eq(tenantCarrierLink.tenantId, tenantId), eq(tenantCarrierLink.carrierId, carrierId)),
    )
    .returning({ carrierId: tenantCarrierLink.carrierId });
  if (updated.length === 0) throw new ApiError(ErrorCode.not_found);
  const [view] = await listLinks(tx, tenantId, [carrierId]);
  if (!view) throw new ApiError(ErrorCode.not_found);
  return view;
}

/** Names of the orgs the current scope may read (`org` RLS); others are absent. */
export async function orgNames(
  tx: Tx,
  ids: readonly AnyOrgId[],
): Promise<Map<string, { name: string; country: string | null }>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: org.id, name: org.name, country: org.country })
    .from(org)
    .where(inArray(org.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, { name: r.name, country: r.country }]));
}
