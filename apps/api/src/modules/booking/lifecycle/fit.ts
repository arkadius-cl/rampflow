import { durationFor } from '@rampflow/shared/modules/booking/duration';
import { CreatedParty, FitFailure } from '@rampflow/shared/modules/booking/values';
import { type LocalDate, siteDay, slotGrid, type TimeZone } from '@rampflow/shared/time';
import type { ConflictReason } from '@rampflow/shared/values';
import { ErrorCode, Setting } from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import type { BookingId, SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { loadDayTimeline } from '../capacity/load.ts';
import { eligibleResources, offersFor } from '../capacity/offers.ts';
import { checkFit } from '../capacity/timeline.ts';
import { type LoadTypeId, loadType, type ResourceId } from '../schema.resources.ts';

// Capacity decisions of create, reschedule and avis edits (ADR-0004, "Booking write"). Callers
// hold `lockSiteCapacity` before calling `findFit`.

export type LoadTypeRow = typeof loadType.$inferSelect;
export type Audience = 'staff' | 'carrier';

export async function loadTypeAt(
  tx: Tx,
  tenantId: TenantId,
  siteId: SiteId,
  id: LoadTypeId,
): Promise<LoadTypeRow | null> {
  const [row] = await tx
    .select()
    .from(loadType)
    .where(and(eq(loadType.tenantId, tenantId), eq(loadType.siteId, siteId), eq(loadType.id, id)));
  return row ?? null;
}

export interface Block {
  durationMinutes: number;
  bufferMinutes: number;
}

export function blockOf(lt: LoadTypeRow, loadUnits: number, access: Access): Block {
  const entitlements = access.entitlements;
  if (!entitlements) throw new Error('booking write without tenant entitlements');
  return {
    durationMinutes: durationFor(lt, loadUnits, entitlements),
    bufferMinutes: lt.bufferMinutes,
  };
}

export function windowOf(startsAt: Date, block: Block) {
  const endsAt = new Date(startsAt.getTime() + block.durationMinutes * 60_000);
  const blocksUntil = new Date(endsAt.getTime() + block.bufferMinutes * 60_000);
  return { startsAt, endsAt, blocksUntil };
}

export interface OfferScope {
  tenantId: TenantId;
  siteId: SiteId;
  loadTypeId: LoadTypeId;
  loadUnits: number;
  audience: Audience;
  excludeBookingId?: BookingId;
}

/** Throws 409 `conflict` with the refreshed starts of the day (BK-04). */
export async function conflictWithOffers(
  tx: Tx,
  access: Access,
  now: Date,
  scope: OfferScope,
  day: LocalDate,
  reason: FitFailure | typeof ConflictReason.not_offered,
): Promise<never> {
  const entitlements = access.entitlements;
  if (!entitlements) throw new Error('booking write without tenant entitlements');
  const offers = await offersFor(
    tx,
    { access: { setting: access.setting, entitlements }, now },
    {
      ...scope,
      day,
    },
  );
  throw new ApiError(ErrorCode.conflict, `Not bookable: ${reason}`, { reason, offers });
}

/**
 * A start must lie on the site's slot grid (staff and carriers), and for carriers inside
 * `[now + booking.min_lead_minutes, now + booking.horizon_days]` (BK-04).
 */
export async function isOffered(
  access: Access,
  siteId: SiteId,
  zone: TimeZone,
  startsAt: Date,
  audience: Audience,
  now: Date,
): Promise<boolean> {
  const grid = (await access.setting(Setting.booking.slot_grid_minutes, siteId)).value;
  const onGrid = slotGrid(siteDay(startsAt, zone), zone, grid).some(
    (s) => s.start.getTime() === startsAt.getTime(),
  );
  if (!onGrid || audience === CreatedParty.staff) return onGrid;
  const lead = (await access.setting(Setting.booking.min_lead_minutes, siteId)).value;
  const horizon = (await access.setting(Setting.booking.horizon_days, siteId)).value;
  const t = startsAt.getTime();
  return t >= now.getTime() + lead * 60_000 && t <= now.getTime() + horizon * 86_400_000;
}

/** Eligible resources in try order: `preferred` first when eligible, then `(sort, id)`. */
export async function candidates(
  tx: Tx,
  tenantId: TenantId,
  lt: LoadTypeRow,
  o: { only?: ResourceId; preferred?: ResourceId },
): Promise<ResourceId[]> {
  const eligible = await eligibleResources(tx, tenantId, lt);
  if (o.only) return eligible.filter((id) => id === o.only);
  const preferred = eligible.filter((id) => id === o.preferred);
  return [...preferred, ...eligible.filter((id) => id !== o.preferred)];
}

export type FitResult = { ok: true; resourceId: ResourceId } | { ok: false; reason: FitFailure };

/**
 * The first candidate where the block fits. `force` (staff with `booking.force`) skips the
 * capacity and daily-cap checks, never the closed check.
 */
export async function findFit(
  tx: Tx,
  access: Access,
  req: {
    tenantId: TenantId;
    siteId: SiteId;
    zone: TimeZone;
    startsAt: Date;
    block: Block;
    candidates: readonly ResourceId[];
    excludeBookingId?: BookingId;
    force: boolean;
  },
): Promise<FitResult> {
  if (req.candidates.length === 0) return { ok: false, reason: FitFailure.closed };
  const timeline = await loadDayTimeline(tx, access, {
    tenantId: req.tenantId,
    siteId: req.siteId,
    day: siteDay(req.startsAt, req.zone),
    resourceIds: req.candidates,
    excludeBookingId: req.excludeBookingId,
  });
  const minutes = req.block.durationMinutes + req.block.bufferMinutes;
  let reason: FitFailure = FitFailure.capacity_full;
  for (const id of req.candidates) {
    const day = timeline.resources.find((r) => r.resource.id === id)?.timeline;
    if (!day) continue;
    const fit = checkFit(day, req.startsAt, minutes);
    if (fit.ok || (req.force && fit.reason !== FitFailure.closed))
      return { ok: true, resourceId: id };
    reason = fit.reason;
  }
  return { ok: false, reason };
}
