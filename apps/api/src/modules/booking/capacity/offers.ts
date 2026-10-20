import type { Entitlements } from '@rampflow/shared';
import type { OfferedStart, Offers } from '@rampflow/shared/modules/booking/api.capacity';
import { durationFor } from '@rampflow/shared/modules/booking/duration';
import { CreatedParty } from '@rampflow/shared/modules/booking/values';
import { type GridSlot, type LocalDate, slotGrid } from '@rampflow/shared/time';
import { ErrorCode, Setting } from '@rampflow/shared/values';
import { and, eq, sql } from 'drizzle-orm';
import type { BookingId, SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import {
  bookableResource,
  type LoadTypeId,
  loadType,
  loadTypeResource,
  type ResourceId,
} from '../schema.resources.ts';
import { loadDayTimeline } from './load.ts';
import { offeredSlots } from './timeline.ts';

export interface OfferRequest {
  tenantId: TenantId;
  siteId: SiteId;
  day: LocalDate;
  loadTypeId: LoadTypeId;
  loadUnits: number;
  /** Only this resource, if it is eligible. */
  resourceId?: ResourceId;
  /** Carriers see starts inside `[now + min lead, now + horizon]` only (BK-04); staff do not. */
  audience: 'staff' | 'carrier';
  excludeBookingId?: BookingId;
}

export interface OfferContext {
  access: Pick<Access, 'setting'> & { entitlements: Pick<Entitlements, 'features'> };
  now: Date;
}

const toOffered = (slot: GridSlot): OfferedStart => ({
  startsAt: slot.start.toISOString(),
  wallTime: slot.wallTime,
  fold: slot.fold,
});

/** Active resources a load type may be booked on: linked, active, serving its direction. */
export async function eligibleResources(
  tx: Tx,
  tenantId: TenantId,
  lt: Pick<typeof loadType.$inferSelect, 'id' | 'siteId' | 'direction'>,
): Promise<ResourceId[]> {
  const rows = await tx
    .select({ id: bookableResource.id })
    .from(loadTypeResource)
    .innerJoin(bookableResource, eq(bookableResource.id, loadTypeResource.resourceId))
    .where(
      and(
        eq(loadTypeResource.tenantId, tenantId),
        eq(loadTypeResource.loadTypeId, lt.id),
        eq(bookableResource.siteId, lt.siteId),
        eq(bookableResource.active, true),
        sql`${lt.direction} = any(${bookableResource.directions})`,
      ),
    )
    .orderBy(bookableResource.sort, bookableResource.id);
  return rows.map((r) => r.id);
}

/** Offered starts of a load type on one site-local day, per eligible resource and as a union. */
export async function offersFor(tx: Tx, ctx: OfferContext, req: OfferRequest): Promise<Offers> {
  const [lt] = await tx
    .select()
    .from(loadType)
    .where(
      and(
        eq(loadType.tenantId, req.tenantId),
        eq(loadType.siteId, req.siteId),
        eq(loadType.id, req.loadTypeId),
      ),
    );
  if (!lt) throw new ApiError(ErrorCode.not_found);
  const bookable = lt.active && (req.audience === CreatedParty.staff || lt.carrierBookable);
  const eligible = bookable ? await eligibleResources(tx, req.tenantId, lt) : [];
  const resourceIds = req.resourceId ? eligible.filter((id) => id === req.resourceId) : eligible;
  const durationMinutes = durationFor(lt, req.loadUnits, ctx.access.entitlements);
  const gridMinutes = (await ctx.access.setting(Setting.booking.slot_grid_minutes, req.siteId))
    .value;
  const timeline = await loadDayTimeline(tx, ctx.access, {
    tenantId: req.tenantId,
    siteId: req.siteId,
    day: req.day,
    resourceIds,
    excludeBookingId: req.excludeBookingId,
  });
  let bounds = null;
  if (req.audience === CreatedParty.carrier) {
    const lead = (await ctx.access.setting(Setting.booking.min_lead_minutes, req.siteId)).value;
    const horizon = (await ctx.access.setting(Setting.booking.horizon_days, req.siteId)).value;
    const now = ctx.now.getTime();
    bounds = { start: new Date(now + lead * 60_000), end: new Date(now + horizon * 86_400_000) };
  }
  const grid = slotGrid(req.day, timeline.timeZone, gridMinutes);
  const blockMinutes = durationMinutes + lt.bufferMinutes;
  const resources = timeline.resources.map(({ resource, timeline: day }) => ({
    resourceId: resource.id,
    name: resource.name,
    slots: offeredSlots(day, grid, blockMinutes, bounds),
  }));
  const union = new Map<number, GridSlot>();
  for (const r of resources) for (const s of r.slots) union.set(s.start.getTime(), s);
  return {
    siteId: req.siteId,
    date: req.day,
    timeZone: timeline.timeZone,
    durationMinutes,
    gridMinutes,
    resources: resources.map((r) => ({
      resourceId: r.resourceId,
      name: r.name,
      starts: r.slots.map(toOffered),
    })),
    starts: [...union.values()]
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map(toOffered),
  };
}
