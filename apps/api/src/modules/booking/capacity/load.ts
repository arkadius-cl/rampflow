import {
  addDays,
  firstInstantFrom,
  isoWeekday,
  type LocalDate,
  type LocalDateTime,
  type LocalTime,
  localDateTimeToInstant,
  localDayRange,
  type TimeZone,
} from '@rampflow/shared/time';
import { and, eq, gt, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { type BookingId, oneOf, type SiteId, type TenantId } from '../../../db/ids.ts';
import { asScope, type Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { systemActor } from '../../../kernel/system.ts';
import { dock, site } from '../../core/schema.ts';
import {
  bookableResource,
  closure,
  openingHours,
  type ResourceId,
  resourceDock,
} from '../schema.resources.ts';
import { booking, LOAD_STATUSES } from '../schema.ts';
import { buildResourceDay, type Interval, OVERHANG_MS, type ResourceDay } from './timeline.ts';

export type ResourceRow = typeof bookableResource.$inferSelect;

export interface DayTimeline {
  siteId: SiteId;
  day: LocalDate;
  timeZone: TimeZone;
  range: Interval;
  /** Every requested resource of the site, in `(sort, id)` order. */
  resources: { resource: ResourceRow; timeline: ResourceDay }[];
}

export interface TimelineRequest {
  tenantId: TenantId;
  siteId: SiteId;
  day: LocalDate;
  /** Omitted: every resource of the site. */
  resourceIds?: readonly ResourceId[];
  /** A reschedule does not count its own booking. */
  excludeBookingId?: BookingId;
}

/** Postgres `time` reads as `HH:mm:ss`; `24:00:00` stays `24:00`. */
const wall = (t: string) => t.slice(0, 5) as LocalTime;
const localDateTime = (t: string) => t.slice(0, 16).replace(' ', 'T') as LocalDateTime;

function hoursIntervals(
  rows: readonly { weekday: number; opens: string; closes: string }[],
  days: readonly LocalDate[],
  zone: TimeZone,
): Interval[] {
  return days.flatMap((day) =>
    rows
      .filter((r) => r.weekday === isoWeekday(day))
      .map((r) => ({
        start: firstInstantFrom(day, wall(r.opens), zone),
        end: firstInstantFrom(day, wall(r.closes), zone),
      })),
  );
}

/**
 * Reads everything availability needs for one site-local day and builds each resource's
 * timeline (ADR-0004, steps 1 to 3). Call it after `lockSiteCapacity` when writing.
 */
export async function loadDayTimeline(
  tx: Tx,
  access: Pick<Access, 'setting'>,
  req: TimelineRequest,
): Promise<DayTimeline> {
  const [siteRow] = await tx
    .select({ timeZone: site.timeZone })
    .from(site)
    .where(and(eq(site.id, req.siteId), eq(site.tenantId, req.tenantId)));
  if (!siteRow) throw new ApiError('not_found');
  const zone = siteRow.timeZone as TimeZone;
  const range = localDayRange(req.day, zone);
  const windowEnd = new Date(range.end.getTime() + OVERHANG_MS);
  const days = [req.day, addDays(req.day, 1)];

  const resources = await tx
    .select()
    .from(bookableResource)
    .where(
      and(
        eq(bookableResource.tenantId, req.tenantId),
        eq(bookableResource.siteId, req.siteId),
        req.resourceIds ? inArray(bookableResource.id, [...req.resourceIds]) : undefined,
      ),
    )
    .orderBy(bookableResource.sort, bookableResource.id);
  const ids = resources.map((r) => r.id);
  if (ids.length === 0)
    return { siteId: req.siteId, day: req.day, timeZone: zone, range, resources: [] };

  const activeDocks = await tx
    .select({ resourceId: resourceDock.resourceId, n: sql<number>`count(*)::int` })
    .from(resourceDock)
    .innerJoin(dock, and(eq(dock.id, resourceDock.dockId), eq(dock.siteId, resourceDock.siteId)))
    .where(
      and(
        eq(resourceDock.tenantId, req.tenantId),
        inArray(resourceDock.resourceId, ids),
        eq(dock.status, 'active'),
      ),
    )
    .groupBy(resourceDock.resourceId);

  const hours = await tx
    .select()
    .from(openingHours)
    .where(
      and(
        eq(openingHours.tenantId, req.tenantId),
        eq(openingHours.siteId, req.siteId),
        or(isNull(openingHours.resourceId), inArray(openingHours.resourceId, ids)),
      ),
    );

  const closeOnHolidays = (await access.setting('booking.close_on_public_holidays', req.siteId))
    .value;
  const closures = await tx
    .select()
    .from(closure)
    .where(
      and(
        eq(closure.tenantId, req.tenantId),
        eq(closure.siteId, req.siteId),
        or(isNull(closure.resourceId), inArray(closure.resourceId, ids)),
        // Local bounds with a day of slack on each side; exact clipping happens on instants.
        lt(closure.startsLocal, `${addDays(req.day, 3)}T00:00`),
        gt(closure.endsLocal, `${addDays(req.day, -1)}T00:00`),
      ),
    );
  const effective = closures.filter(
    (c) => c.source === 'manual' || (closeOnHolidays && c.reopenedAt === null),
  );

  // Carriers never read other carriers' bookings; their load comes through this tenant read.
  const load = await asScope(
    tx,
    { party: 'tenant', tenantId: req.tenantId, siteIds: 'all', actor: systemActor('capacity') },
    (inner) =>
      inner
        .select({
          resourceId: booking.resourceId,
          startsAt: booking.startsAt,
          blocksUntil: booking.blocksUntil,
        })
        .from(booking)
        .where(
          and(
            eq(booking.tenantId, req.tenantId),
            inArray(booking.resourceId, ids),
            oneOf(booking.status, LOAD_STATUSES),
            lt(booking.startsAt, windowEnd),
            gt(booking.blocksUntil, range.start),
            gte(booking.startsAt, new Date(range.start.getTime() - OVERHANG_MS)),
            req.excludeBookingId ? sql`${booking.id} <> ${req.excludeBookingId}` : undefined,
          ),
        ),
  );

  const siteOpen = hoursIntervals(
    hours.filter((h) => h.resourceId === null),
    days,
    zone,
  );
  const toInterval = (c: (typeof closures)[number]): Interval => ({
    start: localDateTimeToInstant(localDateTime(c.startsLocal), zone),
    end: localDateTimeToInstant(localDateTime(c.endsLocal), zone),
  });

  return {
    siteId: req.siteId,
    day: req.day,
    timeZone: zone,
    range,
    resources: resources.map((resource) => {
      const ownHours = hours.filter((h) => h.resourceId === resource.id);
      const docks = activeDocks.find((d) => d.resourceId === resource.id)?.n ?? 0;
      const baseCapacity = resource.active ? Math.min(docks, resource.capacityCap ?? docks) : 0;
      const timeline = buildResourceDay({
        day: range,
        baseCapacity,
        dailyCap: resource.dailyCap,
        siteOpen,
        resourceOpen: ownHours.length > 0 ? hoursIntervals(ownHours, days, zone) : null,
        closed: effective
          .filter((c) => c.resourceId === null || c.resourceId === resource.id)
          .map(toInterval),
        load: load.filter((b) => b.resourceId === resource.id),
      });
      return { resource, timeline };
    }),
  };
}
