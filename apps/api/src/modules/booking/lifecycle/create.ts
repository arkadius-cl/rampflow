import { randomInt } from 'node:crypto';
import { type Avis, normalizePlate, totalLoadUnits } from '@rampflow/shared/modules/avis/avis';
import type { CarrierRef } from '@rampflow/shared/modules/booking/api.staff';
import {
  BookingEventType,
  BookingParty,
  BookingStatus,
  CarrierLinkStatus,
  CommandName,
  CreatedParty,
  CreateMode,
  type TurnAwayReason,
  WalkInOutcome,
} from '@rampflow/shared/modules/booking/values';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { SafetyStatus } from '@rampflow/shared/modules/safety/values';
import { siteDay, slotGrid, type TimeZone } from '@rampflow/shared/time';
import {
  ConflictReason,
  EmailTemplate,
  ErrorCode,
  ForbiddenReason,
  Permission,
  Setting,
} from '@rampflow/shared/values';
import { and, eq } from 'drizzle-orm';
import type { CarrierId, SiteId } from '../../../db/ids.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { checkAvis, recordPlateOnly, writeAvis } from '../../avis/avis.ts';
import { org, site, tenantCarrierLink } from '../../core/schema.ts';
import { invalid } from '../../core/sites/tenant.ts';
import { issueDriverLink } from '../../driver/access.ts';
import { lockSiteCapacity } from '../capacity/lock.ts';
import { bookableResource, type LoadTypeId, type ResourceId } from '../schema.resources.ts';
import { BOOKING_CODE_KEY, booking, bookingEvent } from '../schema.ts';
import { actorUserId, type BookingContext, eventActor } from './context.ts';
import { carrierNames } from './elevated.ts';
import {
  blockOf,
  candidates,
  conflictWithOffers,
  findFit,
  isOffered,
  type LoadTypeRow,
  loadTypeAt,
  windowOf,
} from './fit.ts';
import { type BookingRow, emailContacts } from './notify.ts';
import { bookingSafety } from './safety.ts';
import { transitionBooking } from './transition.ts';

// createBooking (ADR-0004 "Booking write", ADR-0005 point 4): creation is not a transition. It
// inserts a `confirmed` booking with its avis, `created` event and driver link; a walk-in then
// checks in or turns away in the same transaction.

interface CreateBase {
  clientRequestId: string;
  siteId: SiteId;
  loadTypeId: LoadTypeId;
}

/** BK-04: a carrier books an offered start for itself. */
export interface CarrierCreate extends CreateBase {
  mode: typeof CreateMode.carrier;
  startsAt: Date;
  avis: Avis;
}

/** BK-02: staff book for a linked carrier or a free-text name; `forceReason` books over capacity. */
export interface StaffCreate extends CreateBase {
  mode: typeof CreateMode.staff;
  resourceId?: ResourceId;
  startsAt: Date;
  carrier: CarrierRef;
  avis: Avis;
  forceReason?: string;
}

/** YD-03: a truck at the gate without a booking. It starts at the grid slot containing now. */
export interface WalkInCreate extends CreateBase {
  mode: typeof CreateMode.walk_in;
  resourceId?: ResourceId;
  carrier: CarrierRef;
  plateSeen: string;
  /** `turn_away` needs only the plate seen and a reason; the avis may stay empty. */
  outcome:
    | { kind: typeof WalkInOutcome.check_in; avis: Avis }
    | { kind: typeof WalkInOutcome.turn_away; avis: Avis | null; reason: TurnAwayReason };
}

export type CreateBookingRequest = CarrierCreate | StaffCreate | WalkInCreate;

export interface CreateResult {
  booking: BookingRow;
  /** `false` when `clientRequestId` named an earlier booking of the same user. */
  created: boolean;
  /** Walk-ins only: `missing` when safety enforcement kept the truck `confirmed`. */
  safety: SafetyStatus | null;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_ATTEMPTS = 3;

/** Eight Crockford base32 characters: 40 bits, no I, L, O or U to misread at the gate. */
export function bookingCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) code += CROCKFORD[randomInt(32)];
  return code;
}

function requirePermissions(ctx: BookingContext, req: CreateBookingRequest) {
  const has = (p: Parameters<typeof ctx.access.permissions.has>[0]) =>
    ctx.access.permissions.has(p);
  const party = ctx.actor.party;
  const allowed =
    req.mode === CreateMode.carrier
      ? party === BookingParty.carrier && has(Permission.booking.book)
      : req.mode === CreateMode.staff
        ? party === BookingParty.staff &&
          has(Permission.booking.staff_book) &&
          (req.forceReason === undefined || has(Permission.booking.force))
        : party === BookingParty.staff &&
          has(Permission.booking.walk_in) &&
          has(Permission.yard.gate);
  if (!allowed)
    throw new ApiError(ErrorCode.forbidden, `Not allowed to create a ${req.mode} booking`);
}

async function siteOf(ctx: BookingContext, siteId: SiteId) {
  const [row] = await ctx.tx
    .select({ id: site.id, timeZone: site.timeZone, active: site.active })
    .from(site)
    .where(and(eq(site.id, siteId), eq(site.tenantId, ctx.tenantId)));
  if (!row) throw new ApiError(ErrorCode.not_found, 'No such site');
  return { ...row, zone: row.timeZone as TimeZone };
}

async function bookableLoadType(ctx: BookingContext, req: CreateBookingRequest) {
  const lt = await loadTypeAt(ctx.tx, ctx.tenantId, req.siteId, req.loadTypeId);
  // Carriers see only carrier-bookable load types (BK-04): anything else is unknown to them.
  if (!lt || (req.mode === CreateMode.carrier && !lt.carrierBookable)) {
    throw new ApiError(ErrorCode.not_found, 'No such load type');
  }
  if (!lt.active) throw invalid(['loadTypeId'], 'The load type is inactive');
  return lt;
}

async function linkActive(ctx: BookingContext, carrierId: CarrierId): Promise<boolean> {
  const [link] = await ctx.tx
    .select({ status: tenantCarrierLink.status })
    .from(tenantCarrierLink)
    .where(
      and(eq(tenantCarrierLink.tenantId, ctx.tenantId), eq(tenantCarrierLink.carrierId, carrierId)),
    );
  return link?.status === CarrierLinkStatus.active;
}

/** The booking's carrier: the acting carrier, an active linked carrier, or free text. */
async function carrierOf(
  ctx: BookingContext,
  req: CreateBookingRequest,
): Promise<{ carrierId: CarrierId | null; carrierName: string }> {
  if (req.mode === CreateMode.carrier) {
    if (ctx.actor.party !== BookingParty.carrier)
      throw new Error('carrier create without a carrier actor');
    const carrierId = ctx.actor.carrierId;
    if (!(await linkActive(ctx, carrierId))) {
      throw new ApiError(ErrorCode.forbidden, 'The carrier link is deactivated', {
        reason: ForbiddenReason.link_inactive,
      });
    }
    const [row] = await ctx.tx.select({ name: org.name }).from(org).where(eq(org.id, carrierId));
    if (!row) throw new Error(`carrier ${carrierId} invisible to itself`);
    return { carrierId, carrierName: row.name };
  }
  if ('name' in req.carrier) return { carrierId: null, carrierName: req.carrier.name };
  const carrierId = req.carrier.id as CarrierId;
  const name = (await linkActive(ctx, carrierId))
    ? (await carrierNames(ctx.tx, [carrierId])).get(carrierId)
    : undefined;
  if (name === undefined) {
    throw invalid(['carrier', 'id'], 'Not an active linked carrier of this tenant');
  }
  return { carrierId, carrierName: name };
}

async function existingRequest(ctx: BookingContext, clientRequestId: string) {
  const createdBy = actorUserId(ctx.actor);
  if (!createdBy) return undefined;
  const [row] = await ctx.tx
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.tenantId, ctx.tenantId),
        eq(booking.createdBy, createdBy),
        eq(booking.clientRequestId, clientRequestId),
      ),
    );
  return row;
}

/** The grid slot that contains `now` (YD-03). */
async function walkInStart(ctx: BookingContext, siteId: SiteId, zone: TimeZone): Promise<Date> {
  const grid = (await ctx.access.setting(Setting.booking.slot_grid_minutes, siteId)).value;
  const slots = slotGrid(siteDay(ctx.now, zone), zone, grid);
  const current = slots.filter((s) => s.start <= ctx.now).at(-1) ?? slots[0];
  if (!current) throw new Error(`no grid slots on ${siteDay(ctx.now, zone)} in ${zone}`);
  return current.start;
}

/** A walk-in skips hours and capacity, so any active resource of the site will do. */
async function walkInResource(
  ctx: BookingContext,
  lt: LoadTypeRow,
  requested: ResourceId | undefined,
): Promise<ResourceId> {
  if (requested) {
    const [row] = await ctx.tx
      .select({ id: bookableResource.id })
      .from(bookableResource)
      .where(
        and(
          eq(bookableResource.id, requested),
          eq(bookableResource.siteId, lt.siteId),
          eq(bookableResource.tenantId, ctx.tenantId),
          eq(bookableResource.active, true),
        ),
      );
    if (!row) throw invalid(['resourceId'], 'Not an active resource of this site');
    return row.id;
  }
  const [first] = await candidates(ctx.tx, ctx.tenantId, lt, {});
  if (!first) throw invalid(['loadTypeId'], 'No active resource takes this load type');
  return first;
}

/** Inserts the row with a fresh code, retrying a code collision inside a savepoint. */
async function insertBooking(
  ctx: BookingContext,
  values: Omit<typeof booking.$inferInsert, 'code'>,
): Promise<BookingRow> {
  for (let attempt = 1; ; attempt++) {
    try {
      const [row] = await ctx.tx.transaction((sp) =>
        sp
          .insert(booking)
          .values({ ...values, code: bookingCode() })
          .returning(),
      );
      if (!row) throw new Error('booking insert returned no row');
      return row;
    } catch (e) {
      const constraint = (e as { cause?: { constraint?: string } }).cause?.constraint;
      if (constraint !== BOOKING_CODE_KEY || attempt >= CODE_ATTEMPTS) throw e;
    }
  }
}

/**
 * Creates a booking in carrier, staff or walk-in mode (booking lifecycle, `create` and
 * `walk_in`). Takes the site capacity lock first; a repeated `clientRequestId` of the same user
 * returns the first booking with `created: false`.
 */
export async function createBooking(
  ctx: BookingContext,
  req: CreateBookingRequest,
): Promise<CreateResult> {
  requirePermissions(ctx, req);
  const s = await siteOf(ctx, req.siteId);
  const lt = await bookableLoadType(ctx, req);
  const carrier = await carrierOf(ctx, req);
  const avis = req.mode === CreateMode.walk_in ? req.outcome.avis : req.avis;

  await lockSiteCapacity(ctx.tx, req.siteId);
  const existing = await existingRequest(ctx, req.clientRequestId);
  if (existing) return { booking: existing, created: false, safety: null };
  if (avis)
    await checkAvis(ctx.tx, ctx.access, { id: null, tenantId: ctx.tenantId, siteId: s.id }, avis);

  const loadUnits = avis ? totalLoadUnits(avis) : 0;
  const block = blockOf(lt, loadUnits, ctx.access);
  let resourceId: ResourceId;
  let startsAt: Date;
  if (req.mode === CreateMode.walk_in) {
    resourceId = await walkInResource(ctx, lt, req.resourceId);
    startsAt = await walkInStart(ctx, s.id, s.zone);
  } else {
    startsAt = req.startsAt;
    const audience = req.mode;
    const scope = { tenantId: ctx.tenantId, siteId: s.id, loadTypeId: lt.id, loadUnits, audience };
    const day = siteDay(startsAt, s.zone);
    if (!(await isOffered(ctx.access, s.id, s.zone, startsAt, audience, ctx.now))) {
      return conflictWithOffers(
        ctx.tx,
        ctx.access,
        ctx.now,
        scope,
        day,
        ConflictReason.not_offered,
      );
    }
    const only = req.mode === CreatedParty.staff ? req.resourceId : undefined;
    const tryOrder = await candidates(ctx.tx, ctx.tenantId, lt, { only });
    if (only && tryOrder.length === 0) {
      throw invalid(['resourceId'], 'The load type cannot be booked on this resource');
    }
    const fit = await findFit(ctx.tx, ctx.access, {
      tenantId: ctx.tenantId,
      siteId: s.id,
      zone: s.zone,
      startsAt,
      block,
      candidates: tryOrder,
      force: req.mode === CreatedParty.staff && req.forceReason !== undefined,
    });
    if (!fit.ok) return conflictWithOffers(ctx.tx, ctx.access, ctx.now, scope, day, fit.reason);
    resourceId = fit.resourceId;
  }

  const window = windowOf(startsAt, block);
  const forceReason = req.mode === CreateMode.staff ? (req.forceReason ?? null) : null;
  const createdBy = actorUserId(ctx.actor);
  const createdParty = req.mode === CreateMode.carrier ? 'carrier' : 'staff';
  const row = await insertBooking(ctx, {
    tenantId: ctx.tenantId,
    siteId: s.id,
    resourceId,
    loadTypeId: lt.id,
    ...carrier,
    status: BookingStatus.confirmed,
    direction: lt.direction,
    ...window,
    siteTimeZone: s.zone,
    loadUnits,
    createdParty,
    createdBy,
    clientRequestId: req.clientRequestId,
    forced: forceReason !== null,
    walkIn: req.mode === CreateMode.walk_in,
    updatedAt: ctx.now,
  });
  const owner = {
    id: row.id,
    tenantId: row.tenantId,
    siteId: row.siteId,
    carrierId: row.carrierId,
  };
  const plateSeen = req.mode === CreateMode.walk_in ? normalizePlate(req.plateSeen) : undefined;
  if (avis) {
    await writeAvis(ctx.tx, owner, avis, { updatedBy: createdBy, now: ctx.now, plateSeen });
  } else if (plateSeen !== undefined) {
    await recordPlateOnly(ctx.tx, owner, plateSeen, { updatedBy: createdBy, now: ctx.now });
  }
  await ctx.tx.insert(bookingEvent).values({
    tenantId: row.tenantId,
    siteId: row.siteId,
    bookingId: row.id,
    carrierId: row.carrierId,
    type: BookingEventType.created,
    fromStatus: null,
    toStatus: 'confirmed',
    at: ctx.now,
    ...eventActor(ctx.actor),
    data: {
      resourceId,
      startsAt: window.startsAt.toISOString(),
      endsAt: window.endsAt.toISOString(),
      blocksUntil: window.blocksUntil.toISOString(),
      loadTypeId: lt.id,
      loadUnits,
      createdParty,
      walkIn: req.mode === CreateMode.walk_in,
      forced: forceReason !== null,
      forceReason,
    },
  });

  if (req.mode !== CreateMode.walk_in) {
    await issueDriverLink(ctx.tx, row, { channel: DriverChannel.link, createdBy });
    await emailContacts(ctx, row, EmailTemplate.booking_confirmed, {});
    return { booking: row, created: true, safety: null };
  }
  if (req.outcome.kind === WalkInOutcome.turn_away) {
    const { booking: turned } = await transitionBooking(ctx, row.id, {
      type: CommandName.turn_away,
      reason: req.outcome.reason,
    });
    return { booking: turned, created: true, safety: null };
  }
  await issueDriverLink(ctx.tx, row, { channel: DriverChannel.link, createdBy });
  const safety = await bookingSafety(ctx.tx, ctx.access, row, ctx.now);
  if (safety.enforced && safety.status === SafetyStatus.missing) {
    return { booking: row, created: true, safety: SafetyStatus.missing };
  }
  const { booking: checkedIn } = await transitionBooking(ctx, row.id, {
    type: CommandName.check_in,
    plateSeen: plateSeen ?? null,
  });
  return { booking: checkedIn, created: true, safety: safety.status };
}
