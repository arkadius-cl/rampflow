import { normalizePlate } from '@rampflow/shared/modules/avis/avis';
import { punctualityOf } from '@rampflow/shared/modules/booking/lifecycle';
import { BookingStatus, OnSiteStatus } from '@rampflow/shared/modules/booking/values';
import { acknowledgementStatus } from '@rampflow/shared/modules/safety/validity';
import { AckStatus, SafetyStatus } from '@rampflow/shared/modules/safety/values';
import type {
  ExpectedView,
  OnSiteTruck,
  OnSiteView,
  YardTruck,
} from '@rampflow/shared/modules/yard/api';
import { type LocalDate, localDayRange, siteDay, type TimeZone } from '@rampflow/shared/time';
import { Setting, values } from '@rampflow/shared/values';
import { and, asc, eq, gte, ilike, inArray, lt, or, type SQL, sql } from 'drizzle-orm';
import type { BookingId, SiteId, TenantId } from '../../db/ids.ts';
import type { Tx } from '../../db/scope.ts';
import type { Access } from '../../kernel/access.ts';
import { avis, avisReference } from '../avis/schema.ts';
import { minutesFromStart } from '../booking/lifecycle/guards.ts';
import { safetyEnforced } from '../booking/lifecycle/safety.ts';
import { bookableResource, loadType } from '../booking/schema.resources.ts';
import { booking } from '../booking/schema.ts';
import { dock, hall } from '../core/schema.ts';
import { requireSite } from '../core/sites/sites.ts';
import { applicableInstructions } from '../safety/authoring/published.ts';
import { bookingAcknowledgement, safetyAcknowledgement, safetyVersion } from '../safety/schema.ts';

// Read models of the gate and dock stations (YD-01, YD-04, YD-06): bookings of one site as
// trucks, with the plate, the dock and hall, the safety status and the waits.

const MINUTE = 60_000;
const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Columns of one truck row. */
const truckColumns = {
  b: booking,
  plate: avis.plate,
  plateSeen: avis.plateSeen,
  driverPhone: avis.driverPhone,
  loadTypeName: loadType.name,
  resourceName: bookableResource.name,
  resourceKind: bookableResource.kind,
  dockCode: dock.code,
  hallName: hall.name,
};

function truckQuery(tx: Tx) {
  return tx
    .select(truckColumns)
    .from(booking)
    .innerJoin(loadType, eq(loadType.id, booking.loadTypeId))
    .innerJoin(bookableResource, eq(bookableResource.id, booking.resourceId))
    .leftJoin(avis, eq(avis.bookingId, booking.id))
    .leftJoin(dock, eq(dock.id, booking.dockId))
    .leftJoin(hall, eq(hall.id, dock.hallId))
    .$dynamic();
}

type TruckRow = Awaited<ReturnType<ReturnType<typeof truckQuery>['execute']>>[number];
type Safety = YardTruck['safety'];

/** The instant the booking entered its current status. */
function sinceOf(b: TruckRow['b']): Date {
  const at: Record<BookingStatus, Date | null> = {
    requested: b.createdAt,
    confirmed: b.createdAt,
    checked_in: b.checkedInAt,
    called: b.calledAt,
    at_dock: b.atDockAt,
    loading: b.loadingAt,
    done: b.doneAt,
    departed: b.departedAt,
    cancelled: b.cancelledAt,
    no_show: b.noShowAt,
    turned_away: b.turnedAwayAt,
  };
  return at[b.status] ?? b.updatedAt;
}

interface Punctual {
  earlyTolerance: number;
  grace: number;
  now: Date;
}

/** Stored after check-in; before it, what a check-in now would record. Walk-ins have none. */
function punctualityFor(b: TruckRow['b'], p: Punctual) {
  if (b.checkedInAt || b.walkIn) {
    return { punctuality: b.punctuality, punctualityMinutes: b.punctualityMinutes };
  }
  if (b.status !== BookingStatus.confirmed && b.status !== BookingStatus.no_show) {
    return { punctuality: null, punctualityMinutes: null };
  }
  const exact = minutesFromStart(p.now, b.startsAt);
  return {
    punctuality:
      b.status === BookingStatus.no_show
        ? ('late' as const)
        : punctualityOf(exact, p.earlyTolerance, p.grace),
    punctualityMinutes: Math.round(exact),
  };
}

function toTruck(r: TruckRow, safety: Safety, p: Punctual): YardTruck {
  const { b } = r;
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    carrierName: b.carrierName,
    plate: r.plateSeen ?? r.plate ?? null,
    driverPhone: r.driverPhone ?? null,
    loadType: { id: b.loadTypeId, name: r.loadTypeName as YardTruck['loadType']['name'] },
    loadUnits: b.loadUnits,
    resource: { id: b.resourceId, name: r.resourceName, kind: r.resourceKind },
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    timeZone: b.siteTimeZone as TimeZone,
    walkIn: b.walkIn,
    safety,
    ...punctualityFor(b, p),
    dock:
      b.dockId && r.dockCode ? { id: b.dockId, code: r.dockCode, hall: r.hallName ?? '' } : null,
    checkedInAt: iso(b.checkedInAt),
    calledAt: iso(b.calledAt),
    atDockAt: iso(b.atDockAt),
    loadingAt: iso(b.loadingAt),
    doneAt: iso(b.doneAt),
    departedAt: iso(b.departedAt),
    noShowAt: iso(b.noShowAt),
    turnedAwayAt: iso(b.turnedAwayAt),
    since: sinceOf(b).toISOString(),
    version: b.version,
  };
}

/**
 * The safety status of many bookings of one site, with one query for their links: the batch
 * form of `bookingSafety`, so a list costs a fixed number of queries.
 */
async function safetyOf(
  tx: Tx,
  access: Access,
  where: { tenantId: TenantId; siteId: SiteId },
  bookingIds: BookingId[],
  now: Date,
): Promise<(id: BookingId) => Safety> {
  const enforced = await safetyEnforced(access, where.siteId);
  if (!access.entitlements?.modules.safety)
    return () => ({ status: SafetyStatus.not_required, enforced: false });
  const applicable = await applicableInstructions(tx, where);
  if (applicable.length === 0 || bookingIds.length === 0) {
    return () => ({
      status: applicable.length === 0 ? SafetyStatus.not_required : SafetyStatus.missing,
      enforced,
    });
  }
  const links = await tx
    .select({
      bookingId: bookingAcknowledgement.bookingId,
      instructionId: bookingAcknowledgement.instructionId,
      ackBookingId: safetyAcknowledgement.bookingId,
      expiresAt: safetyAcknowledgement.expiresAt,
      restrictedAt: safetyAcknowledgement.restrictedAt,
      version: safetyVersion.version,
    })
    .from(bookingAcknowledgement)
    .innerJoin(
      safetyAcknowledgement,
      and(
        eq(safetyAcknowledgement.id, bookingAcknowledgement.acknowledgementId),
        eq(safetyAcknowledgement.tenantId, where.tenantId),
      ),
    )
    .innerJoin(safetyVersion, eq(safetyVersion.id, safetyAcknowledgement.versionId))
    .where(inArray(bookingAcknowledgement.bookingId, bookingIds));
  const valid = new Set<string>();
  for (const l of links) {
    const instruction = applicable.find((i) => i.instructionId === l.instructionId);
    if (!instruction || l.restrictedAt !== null) continue;
    const status = acknowledgementStatus(
      { version: l.version, bookingId: l.ackBookingId, expiresAt: l.expiresAt },
      { now, bookingId: l.bookingId, materialFloor: instruction.materialFloor },
    );
    if (status === AckStatus.valid) valid.add(`${l.bookingId}:${l.instructionId}`);
  }
  return (id) => ({
    status: applicable.every((i) => valid.has(`${id}:${i.instructionId}`))
      ? SafetyStatus.valid
      : SafetyStatus.missing,
    enforced,
  });
}

export interface YardScope {
  tx: Tx;
  access: Access;
  tenantId: TenantId;
  siteId: SiteId;
  now: Date;
}

async function trucks(
  s: YardScope,
  where: SQL | undefined,
  order: SQL[],
  limit = 1000,
): Promise<YardTruck[]> {
  const rows = await truckQuery(s.tx)
    .where(and(eq(booking.tenantId, s.tenantId), eq(booking.siteId, s.siteId), where))
    .orderBy(...order)
    .limit(limit);
  const safety = await safetyOf(
    s.tx,
    s.access,
    s,
    rows.map((r) => r.b.id),
    s.now,
  );
  const p: Punctual = {
    earlyTolerance: (await s.access.setting(Setting.yard.early_tolerance_minutes, s.siteId)).value,
    grace: (await s.access.setting(Setting.yard.grace_minutes, s.siteId)).value,
    now: s.now,
  };
  return rows.map((r) => toTruck(r, safety(r.b.id), p));
}

/** One booking as a truck; 404 is the caller's: the booking was just read under the same scope. */
export async function truckOf(
  s: Omit<YardScope, 'siteId'>,
  bookingId: BookingId,
): Promise<YardTruck> {
  const [row] = await s.tx
    .select({ siteId: booking.siteId })
    .from(booking)
    .where(and(eq(booking.id, bookingId), eq(booking.tenantId, s.tenantId)));
  if (!row) throw new Error(`booking ${bookingId} not visible`);
  const [truck] = await trucks({ ...s, siteId: row.siteId }, eq(booking.id, bookingId), []);
  if (!truck) throw new Error(`booking ${bookingId} not visible`);
  return truck;
}

const VISIBLE = [
  'confirmed',
  'no_show',
  ...values(OnSiteStatus),
  'departed',
  'turned_away',
] as const;

/**
 * YD-01: the bookings of a site-local day, by start, and the no-shows of that day whose slot
 * lay the day before (a 23:30 slot marked at 00:30 still checks in that day).
 */
export async function expectedTrucks(s: YardScope, date?: LocalDate): Promise<ExpectedView> {
  const site = await requireSite(s.tx, s.tenantId, s.siteId);
  const zone = site.timeZone as TimeZone;
  const day = date ?? siteDay(s.now, zone);
  const { start, end } = localDayRange(day, zone);
  const items = await trucks(
    s,
    and(
      inArray(booking.status, VISIBLE),
      or(
        and(gte(booking.startsAt, start), lt(booking.startsAt, end)),
        and(eq(booking.status, 'no_show'), gte(booking.noShowAt, start), lt(booking.noShowAt, end)),
      ),
    ),
    [asc(booking.startsAt), asc(booking.id)],
  );
  return { siteId: s.siteId, date: day, timeZone: zone, items };
}

const minutesBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / MINUTE));

/** YD-04 waits: wait runs from `max(checked_in_at, starts_at)` until the truck is at the dock. */
export function withWaits(t: YardTruck, now: Date, standgeldMinutes: number): OnSiteTruck {
  const checkedIn = new Date(t.checkedInAt ?? t.since);
  const waitFrom = new Date(Math.max(checkedIn.getTime(), new Date(t.startsAt).getTime()));
  const docked = t.atDockAt ?? t.loadingAt ?? t.doneAt;
  const onSiteMinutes = minutesBetween(checkedIn, now);
  return {
    ...t,
    onSiteMinutes,
    waitMinutes: minutesBetween(waitFrom, docked ? new Date(docked) : now),
    standgeld: now.getTime() - checkedIn.getTime() > standgeldMinutes * MINUTE,
  };
}

/** YD-04: every truck on the site, whatever day it was booked for, by gate-in. */
export async function onSiteTrucks(s: YardScope): Promise<OnSiteView> {
  const site = await requireSite(s.tx, s.tenantId, s.siteId);
  const standgeldMinutes = (await s.access.setting(Setting.yard.standgeld_flag_minutes, s.siteId))
    .value;
  const items = await trucks(s, inArray(booking.status, values(OnSiteStatus)), [
    asc(booking.checkedInAt),
    asc(booking.id),
  ]);
  return {
    siteId: s.siteId,
    timeZone: site.timeZone as TimeZone,
    standgeldMinutes,
    items: items.map((t) => withWaits(t, s.now, standgeldMinutes)),
  };
}

const SEARCH_LIMIT = 20;

/**
 * YD-01: a booking code as a scanner types it, a plate (announced or seen), a reference or part
 * of the carrier name. Active visits and today's no-shows, nearest start first.
 */
export async function searchTrucks(s: YardScope, q: string): Promise<YardTruck[]> {
  const site = await requireSite(s.tx, s.tenantId, s.siteId);
  const { start } = localDayRange(
    siteDay(s.now, site.timeZone as TimeZone),
    site.timeZone as TimeZone,
  );
  const upper = q.trim().toUpperCase();
  const plate = normalizePlate(q);
  const reference = s.tx
    .select({ id: avisReference.bookingId })
    .from(avisReference)
    .where(and(eq(avisReference.tenantId, s.tenantId), eq(avisReference.valueNorm, upper)));
  return trucks(
    s,
    and(
      or(
        inArray(booking.status, ['confirmed', ...values(OnSiteStatus)]),
        and(eq(booking.status, 'no_show'), gte(booking.noShowAt, start)),
      ),
      or(
        eq(booking.code, upper),
        plate.length > 0 ? or(eq(avis.plate, plate), eq(avis.plateSeen, plate)) : undefined,
        inArray(booking.id, reference),
        ilike(booking.carrierName, `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`),
      ),
    ),
    [
      sql`abs(extract(epoch from ${booking.startsAt} - ${s.now.toISOString()}::timestamptz))`,
      asc(booking.id),
    ],
    SEARCH_LIMIT,
  );
}
