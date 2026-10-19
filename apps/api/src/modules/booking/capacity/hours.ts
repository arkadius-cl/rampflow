import type { HoursRowView, PutHours } from '@rampflow/shared/modules/booking/api.capacity';
import type { LocalTime } from '@rampflow/shared/time';
import { and, eq, isNull } from 'drizzle-orm';
import type { SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { requireSite } from '../../core/sites/sites.ts';
import { bookableResource, openingHours, type ResourceId } from '../schema.resources.ts';

const wall = (t: string) => t.slice(0, 5) as LocalTime;

/** Site hours and every resource's own hours of one site (MD-04). */
export async function listHours(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
): Promise<HoursRowView[]> {
  await requireSite(tx, tenantId, siteId);
  const rows = await tx
    .select()
    .from(openingHours)
    .where(and(eq(openingHours.tenantId, tenantId), eq(openingHours.siteId, siteId)))
    .orderBy(openingHours.resourceId, openingHours.weekday, openingHours.opens);
  return rows.map((r) => ({
    resourceId: r.resourceId,
    weekday: r.weekday,
    opens: wall(r.opens),
    closes: wall(r.closes),
  }));
}

/** Replaces the weekly hours of the site (`resourceId` null) or of one of its resources. */
export async function putHours(
  tx: Tx,
  tenantId: TenantId,
  input: PutHours,
): Promise<HoursRowView[]> {
  const siteId = input.siteId as SiteId;
  await requireSite(tx, tenantId, siteId);
  const resourceId = input.resourceId as ResourceId | null;
  if (resourceId) {
    const [resource] = await tx
      .select({ id: bookableResource.id })
      .from(bookableResource)
      .where(
        and(
          eq(bookableResource.tenantId, tenantId),
          eq(bookableResource.siteId, siteId),
          eq(bookableResource.id, resourceId),
        ),
      );
    if (!resource) throw new ApiError('not_found');
  }
  await tx
    .delete(openingHours)
    .where(
      and(
        eq(openingHours.tenantId, tenantId),
        eq(openingHours.siteId, siteId),
        resourceId ? eq(openingHours.resourceId, resourceId) : isNull(openingHours.resourceId),
      ),
    );
  if (input.rows.length > 0) {
    await tx
      .insert(openingHours)
      .values(input.rows.map((r) => ({ tenantId, siteId, resourceId, ...r })));
  }
  return (await listHours(tx, tenantId, siteId)).filter((r) => r.resourceId === resourceId);
}
