import {
  type KpiReport,
  mean,
  percent,
  type ReportFilter,
  round1,
  type VisitItem,
  type VisitPage,
  type VisitQuery,
} from '@rampflow/shared/modules/report/api';
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
import { ErrorCode, Setting } from '@rampflow/shared/values';
import { and, asc, eq, gt, gte, isNull, lt, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import * as z from 'zod';
import type { SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { ApiError } from '../../../kernel/errors.ts';
import {
  bookableResource,
  closure,
  openingHours,
  resourceDock,
} from '../../booking/schema.resources.ts';
import { booking } from '../../booking/schema.ts';
import { dock, site } from '../../core/schema.ts';
import { type Interval, openMinutes } from './open-minutes.ts';

// RP-01 and RP-02 read only booking columns (booking lifecycle, "KPIs"): one indexed range scan
// over (tenant_id, site_id, starts_at), so event retention never changes a number.

export interface ReportContext {
  tx: Tx;
  tenantId: TenantId;
  access: Pick<Access, 'setting'>;
  now: Date;
}

type ReportSite = KpiReport['site'] & { id: SiteId };

/** The filter's site, 404 when the caller cannot see it or the resource is not on it. */
async function reportSite(ctx: ReportContext, f: ReportFilter): Promise<ReportSite> {
  const [row] = await ctx.tx
    .select({ id: site.id, name: site.name, timeZone: site.timeZone })
    .from(site)
    .where(and(eq(site.id, f.siteId as SiteId), eq(site.tenantId, ctx.tenantId)));
  if (!row) throw new ApiError(ErrorCode.not_found, 'No such site');
  if (f.resourceId) {
    const [resource] = await ctx.tx
      .select({ id: bookableResource.id })
      .from(bookableResource)
      .where(
        and(
          eq(bookableResource.id, f.resourceId as never),
          eq(bookableResource.siteId, row.id),
          eq(bookableResource.tenantId, ctx.tenantId),
        ),
      );
    if (!resource) throw new ApiError(ErrorCode.not_found, 'No such resource at this site');
  }
  return row;
}

/** The site-local dates as one instant range (ADR-0012, "Days"). */
export function periodRange(from: LocalDate, to: LocalDate, zone: TimeZone): Interval {
  return { start: localDayRange(from, zone).start, end: localDayRange(to, zone).end };
}

/** Bookings whose `starts_at` lies in the period, with the resource and carrier filters. */
function inPeriod(ctx: ReportContext, f: ReportFilter, range: Interval): SQL {
  return and(
    eq(booking.tenantId, ctx.tenantId),
    eq(booking.siteId, f.siteId as SiteId),
    gte(booking.startsAt, range.start),
    lt(booking.startsAt, range.end),
    f.resourceId ? eq(booking.resourceId, f.resourceId as never) : undefined,
    f.carrierId ? eq(booking.carrierId, f.carrierId as never) : undefined,
  ) as SQL;
}

const minutes = (later: SQLWrapper, earlier: SQLWrapper) =>
  sql`extract(epoch from (${later} - ${earlier})) / 60`;
/** A truck docked before its slot started waited 0 minutes, not a negative time. */
const waitMinutes = sql`greatest(0, ${minutes(
  sql`${booking.atDockAt}`,
  sql`greatest(${booking.checkedInAt}, ${booking.startsAt})`,
)})`;
const dwellMinutes = minutes(sql`${booking.doneAt}`, sql`${booking.atDockAt}`);
const turnaroundMinutes = minutes(sql`${booking.departedAt}`, sql`${booking.checkedInAt}`);

const count = (where: SQL) => sql<number>`(count(*) filter (where ${where}))::int`;
const sumOf = (value: SQL, where: SQL) =>
  sql<number>`coalesce(sum(${value}) filter (where ${where}), 0)::float8`;

const both = (a: SQLWrapper, b: SQLWrapper) => sql`${a} is not null and ${b} is not null`;
const hasWait = both(booking.atDockAt, booking.checkedInAt);
const hasDwell = both(booking.doneAt, booking.atDockAt);
const hasTurnaround = both(booking.departedAt, booking.checkedInAt);

/** Wall time `HH:mm:ss` from Postgres `time`; `24:00:00` stays `24:00`. */
const wall = (t: string) => t.slice(0, 5) as LocalTime;
const localDateTime = (t: string) => t.slice(0, 16).replace(' ', 'T') as LocalDateTime;

/**
 * Open minutes of the site over the period: its weekly hours on each local day minus its
 * closures, holiday closures only while `booking.close_on_public_holidays` is on.
 */
async function siteOpenMinutes(
  ctx: ReportContext,
  s: ReportSite,
  f: ReportFilter,
  range: Interval,
): Promise<number> {
  const zone = s.timeZone as TimeZone;
  const hours = await ctx.tx
    .select({
      weekday: openingHours.weekday,
      opens: openingHours.opens,
      closes: openingHours.closes,
    })
    .from(openingHours)
    .where(
      and(
        eq(openingHours.tenantId, ctx.tenantId),
        eq(openingHours.siteId, s.id),
        isNull(openingHours.resourceId),
      ),
    );
  const open: Interval[] = [];
  for (let day = f.from; day <= f.to; day = addDays(day, 1)) {
    for (const h of hours.filter((r) => r.weekday === isoWeekday(day))) {
      open.push({
        start: firstInstantFrom(day, wall(h.opens), zone),
        end: firstInstantFrom(day, wall(h.closes), zone),
      });
    }
  }
  const closeOnHolidays = (await ctx.access.setting(Setting.booking.close_on_public_holidays, s.id))
    .value;
  const closures = await ctx.tx
    .select()
    .from(closure)
    .where(
      and(
        eq(closure.tenantId, ctx.tenantId),
        eq(closure.siteId, s.id),
        isNull(closure.resourceId),
        // Local bounds with a day of slack; the clipping happens on instants.
        lt(closure.startsLocal, `${addDays(f.to, 2)}T00:00`),
        gt(closure.endsLocal, `${addDays(f.from, -1)}T00:00`),
        or(eq(closure.source, 'manual'), closeOnHolidays ? isNull(closure.reopenedAt) : sql`false`),
      ),
    );
  const closed = closures.map((c) => ({
    start: localDateTimeToInstant(localDateTime(c.startsLocal), zone),
    end: localDateTimeToInstant(localDateTime(c.endsLocal), zone),
  }));
  const clip = (i: Interval): Interval => ({
    start: new Date(Math.max(i.start.getTime(), range.start.getTime())),
    end: new Date(Math.min(i.end.getTime(), range.end.getTime())),
  });
  return openMinutes(open.map(clip), closed);
}

/** Active docks of the site, or of the filtered resource. */
async function activeDocks(ctx: ReportContext, s: ReportSite, f: ReportFilter): Promise<number> {
  const where = and(
    eq(dock.tenantId, ctx.tenantId),
    eq(dock.siteId, s.id),
    eq(dock.status, 'active'),
  );
  const [row] = f.resourceId
    ? await ctx.tx
        .select({ n: sql<number>`count(*)::int` })
        .from(dock)
        .innerJoin(resourceDock, eq(resourceDock.dockId, dock.id))
        .where(and(where, eq(resourceDock.resourceId, f.resourceId as never)))
    : await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(dock).where(where);
  return row?.n ?? 0;
}

/** RP-01: the KPI table of one site and period. */
export async function kpiReport(ctx: ReportContext, f: ReportFilter): Promise<KpiReport> {
  const s = await reportSite(ctx, f);
  const range = periodRange(f.from, f.to, s.timeZone as TimeZone);
  const standgeldMinutes = (await ctx.access.setting(Setting.yard.standgeld_flag_minutes, s.id))
    .value;

  const due = sql`${booking.startsAt} <= ${ctx.now} and not ${booking.walkIn} and not (${booking.status} = 'cancelled' and not ${booking.cancelledLate})`;
  const arrived = sql`${booking.checkedInAt} is not null and not ${booking.walkIn}`;
  const punctual = (p: string) => sql`${arrived} and ${booking.punctuality} = ${p}`;
  const [row] = await ctx.tx
    .select({
      bookings: sql<number>`count(*)::int`,
      carrierCreated: count(sql`${booking.createdParty} = 'carrier'`),
      due: count(due),
      noShows: count(sql`${due} and ${booking.noShowAt} is not null`),
      lateCancellations: count(sql`${due} and ${booking.cancelledLate}`),
      arrived: count(arrived),
      onTime: count(punctual('on_time')),
      early: count(punctual('early')),
      late: count(punctual('late')),
      waitSum: sumOf(waitMinutes, hasWait),
      waitN: count(hasWait),
      dwellSum: sumOf(dwellMinutes, hasDwell),
      dwellN: count(hasDwell),
      turnaroundSum: sumOf(turnaroundMinutes, hasTurnaround),
      turnaroundN: count(hasTurnaround),
      standgeld: count(sql`${hasTurnaround} and ${turnaroundMinutes} > ${standgeldMinutes}`),
    })
    .from(booking)
    .where(inPeriod(ctx, f, range));
  if (!row) throw new Error('aggregate without a row');

  const capacityMinutes =
    (await activeDocks(ctx, s, f)) * (await siteOpenMinutes(ctx, s, f, range));
  return {
    site: s,
    from: f.from,
    to: f.to,
    standgeldMinutes,
    kpis: {
      bookingsDue: row.due,
      noShowRate: percent(row.noShows, row.due),
      lateCancellationRate: percent(row.lateCancellations, row.due),
      onTimeRate: percent(row.onTime, row.arrived),
      earlyRate: percent(row.early, row.arrived),
      lateRate: percent(row.late, row.arrived),
      waitMinutes: mean(row.waitSum, row.waitN),
      dockDwellMinutes: mean(row.dwellSum, row.dwellN),
      turnaroundMinutes: mean(row.turnaroundSum, row.turnaroundN),
      dockUtilisation: percent(row.dwellSum, capacityMinutes),
      portalAdoption: percent(row.carrierCreated, row.bookings),
      standgeldVisits: row.standgeld,
    },
  };
}

const Cursor = z.object({ t: z.iso.datetime(), id: z.uuid() });

const encodeCursor = (v: { startsAt: string; id: string }) =>
  Buffer.from(JSON.stringify({ t: v.startsAt, id: v.id })).toString('base64url');

function decodeCursor(cursor: string) {
  try {
    return Cursor.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new ApiError(ErrorCode.validation_failed, 'Invalid cursor', {
      issues: [{ path: ['cursor'], code: 'custom', message: 'Invalid cursor' }],
    });
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const span = (later: Date | null, earlier: Date | null) =>
  later && earlier ? round1((later.getTime() - earlier.getTime()) / 60_000) : null;

async function queryVisits(
  ctx: ReportContext,
  f: ReportFilter,
  s: ReportSite,
  page: { limit: number; cursor?: string },
): Promise<VisitItem[]> {
  const range = periodRange(f.from, f.to, s.timeZone as TimeZone);
  const after = page.cursor ? decodeCursor(page.cursor) : null;
  const rows = await ctx.tx
    .select({ b: booking, resourceName: bookableResource.name, dockCode: dock.code })
    .from(booking)
    .innerJoin(bookableResource, eq(bookableResource.id, booking.resourceId))
    .leftJoin(dock, eq(dock.id, booking.dockId))
    .where(
      and(
        inPeriod(ctx, f, range),
        after
          ? sql`(${booking.startsAt}, ${booking.id}) > (${new Date(after.t)}, ${after.id})`
          : undefined,
      ),
    )
    .orderBy(asc(booking.startsAt), asc(booking.id))
    .limit(page.limit);
  return rows.map(({ b, resourceName, dockCode }) => ({
    id: b.id,
    code: b.code,
    status: b.status,
    carrierName: b.carrierName,
    resourceName,
    dockCode,
    direction: b.direction,
    createdParty: b.createdParty,
    walkIn: b.walkIn,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    punctuality: b.punctuality,
    punctualityMinutes: b.punctualityMinutes,
    checkedInAt: iso(b.checkedInAt),
    calledAt: iso(b.calledAt),
    atDockAt: iso(b.atDockAt),
    loadingAt: iso(b.loadingAt),
    doneAt: iso(b.doneAt),
    departedAt: iso(b.departedAt),
    cancelledAt: iso(b.cancelledAt),
    cancelledLate: b.cancelledLate,
    noShowAt: iso(b.noShowAt),
    turnedAwayAt: iso(b.turnedAwayAt),
    waitMinutes:
      b.atDockAt && b.checkedInAt
        ? round1(
            Math.max(
              0,
              b.atDockAt.getTime() - Math.max(b.checkedInAt.getTime(), b.startsAt.getTime()),
            ) / 60_000,
          )
        : null,
    dockDwellMinutes: span(b.doneAt, b.atDockAt),
    turnaroundMinutes: span(b.departedAt, b.checkedInAt),
  }));
}

/** RP-02: the visits of the period with every timestamp, by start, cursor-paginated. */
export async function visitPage(ctx: ReportContext, q: VisitQuery): Promise<VisitPage> {
  const s = await reportSite(ctx, q);
  const items = await queryVisits(ctx, q, s, { limit: q.limit + 1, cursor: q.cursor });
  const page = items.slice(0, q.limit);
  const last = page.at(-1);
  return {
    site: s,
    items: page,
    nextCursor: items.length > q.limit && last ? encodeCursor(last) : null,
  };
}

/** Rows one CSV export holds at most. */
export const CSV_MAX_ROWS = 50_000;

/** RP-02: every visit of the period for the CSV export. */
export async function allVisits(
  ctx: ReportContext,
  f: ReportFilter,
): Promise<{ site: ReportSite; items: VisitItem[] }> {
  const s = await reportSite(ctx, f);
  return { site: s, items: await queryVisits(ctx, f, s, { limit: CSV_MAX_ROWS }) };
}
