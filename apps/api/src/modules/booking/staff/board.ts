import type {
  BoardSlot,
  BoardView,
  BookingListQuery,
  BookingPage,
} from '@rampflow/shared/modules/booking/api.staff';
import { type BookingStatus, LOAD_STATUSES } from '@rampflow/shared/modules/booking/lifecycle';
import { type LocalDate, slotGrid } from '@rampflow/shared/time';
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import type { SiteId, TenantId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { Access } from '../../../kernel/access.ts';
import { requireSite } from '../../core/sites/sites.ts';
import { type DayTimeline, loadDayTimeline } from '../capacity/load.ts';
import { BUCKET_MINUTES, isOverCapacity, type ResourceDay } from '../capacity/timeline.ts';
import type { BookingRow } from '../lifecycle/notify.ts';
import { bookingSummary, decodeCursor, encodeCursor } from '../lifecycle/view.ts';
import { booking } from '../schema.ts';

// BK-01: the plan board of one site-local day and its list view, from the capacity timeline of
// U4 and the day's bookings.

const BUCKET_MS = BUCKET_MINUTES * 60_000;
const counts = (status: BookingStatus) => (LOAD_STATUSES as readonly string[]).includes(status);

/** Lowest capacity and highest load over the buckets of `[start, start + minutes)`. */
function slotLoad(
  day: ResourceDay,
  start: Date,
  minutes: number,
): Pick<BoardSlot, 'capacity' | 'booked'> {
  const from = Math.floor((start.getTime() - day.windowStart.getTime()) / BUCKET_MS);
  const to = from + Math.ceil(minutes / BUCKET_MINUTES);
  let capacity = Number.POSITIVE_INFINITY;
  let booked = 0;
  for (let i = Math.max(0, from); i < Math.min(day.capacity.length, to); i++) {
    capacity = Math.min(capacity, day.capacity[i] ?? 0);
    booked = Math.max(booked, day.load[i] ?? 0);
  }
  return { capacity: Number.isFinite(capacity) ? capacity : 0, booked };
}

function overCapacityIn(timeline: DayTimeline) {
  return (b: BookingRow) => {
    const day = timeline.resources.find((r) => r.resource.id === b.resourceId)?.timeline;
    return day !== undefined && counts(b.status) && isOverCapacity(day, b);
  };
}

async function dayTimeline(
  tx: Tx,
  access: Access,
  tenantId: TenantId,
  siteId: SiteId,
  day: LocalDate,
) {
  await requireSite(tx, tenantId, siteId);
  return loadDayTimeline(tx, access, { tenantId, siteId, day });
}

export async function loadBoard(
  tx: Tx,
  access: Access,
  where: { tenantId: TenantId; siteId: SiteId; day: LocalDate },
): Promise<BoardView> {
  const timeline = await dayTimeline(tx, access, where.tenantId, where.siteId, where.day);
  const gridMinutes = (await access.setting('booking.slot_grid_minutes', where.siteId)).value;
  const grid = slotGrid(where.day, timeline.timeZone, gridMinutes);
  const rows = await tx
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.tenantId, where.tenantId),
        eq(booking.siteId, where.siteId),
        gte(booking.startsAt, timeline.range.start),
        lt(booking.startsAt, timeline.range.end),
      ),
    )
    .orderBy(asc(booking.startsAt), asc(booking.id));
  const over = overCapacityIn(timeline);
  return {
    siteId: where.siteId,
    date: where.day,
    timeZone: timeline.timeZone,
    gridMinutes,
    resources: timeline.resources.map(({ resource, timeline: day }) => ({
      id: resource.id,
      name: resource.name,
      kind: resource.kind,
      dailyCap: resource.dailyCap,
      slots: grid.map((s) => ({
        startsAt: s.start.toISOString(),
        wallTime: s.wallTime,
        fold: s.fold,
        ...slotLoad(day, s.start, gridMinutes),
      })),
      bookings: rows
        .filter((b) => b.resourceId === resource.id)
        .map((b) => bookingSummary(b, over(b))),
    })),
  };
}

/** The list view of the board (BK-01 accessibility), in start order, cursor-paginated. */
export async function listBookings(
  tx: Tx,
  access: Access,
  tenantId: TenantId,
  q: BookingListQuery,
): Promise<BookingPage> {
  const siteId = q.siteId as SiteId;
  const timeline = await dayTimeline(tx, access, tenantId, siteId, q.date);
  const after = q.cursor ? decodeCursor(q.cursor) : null;
  const rows = await tx
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.tenantId, tenantId),
        eq(booking.siteId, siteId),
        gte(booking.startsAt, timeline.range.start),
        lt(booking.startsAt, timeline.range.end),
        q.status ? eq(booking.status, q.status) : undefined,
        after ? sql`(${booking.startsAt}, ${booking.id}) > (${after.at}, ${after.id})` : undefined,
      ),
    )
    .orderBy(asc(booking.startsAt), asc(booking.id))
    .limit(q.limit + 1);
  const items = rows.slice(0, q.limit);
  const last = items.at(-1);
  const over = overCapacityIn(timeline);
  return {
    items: items.map((b) => bookingSummary(b, over(b))),
    nextCursor: rows.length > q.limit && last ? encodeCursor(last.startsAt, last.id) : null,
  };
}
