import { FitFailure } from '@rampflow/shared/modules/booking/values';
import type { GridSlot } from '@rampflow/shared/time';

// The capacity timeline of one resource on one site-local day (ADR-0004, "Availability").
// Pure: buckets are 5-minute instants counted from the local day start, never wall times.

export const BUCKET_MINUTES = 5;
const BUCKET_MS = BUCKET_MINUTES * 60_000;
/** Longest block (720 min duration + 240 min buffer): how far a day's starts reach into the next. */
export const OVERHANG_MS = 16 * 3_600_000;

/** `[start, end)`. */
export interface Interval {
  start: Date;
  end: Date;
}

export interface LoadInterval {
  startsAt: Date;
  blocksUntil: Date;
}

export interface ResourceDayInput {
  /** `localDayRange` of the day: candidate starts lie in it, the daily cap counts it. */
  day: Interval;
  /** Active member docks capped by `capacity_cap`; 0 for an inactive resource. */
  baseCapacity: number;
  dailyCap: number | null;
  /** Site hours; the resource's own hours when it has rows narrow them further. */
  siteOpen: readonly Interval[];
  resourceOpen: readonly Interval[] | null;
  /** Effective closures of the site and the resource. */
  closed: readonly Interval[];
  /** Active bookings that overlap the window, the one being rescheduled left out. */
  load: readonly LoadInterval[];
}

export interface ResourceDay {
  day: Interval;
  windowStart: Date;
  dailyCap: number | null;
  capacity: Int32Array;
  load: Int32Array;
  /** Active bookings whose `starts_at` lies on the day, for the daily cap. */
  startsOnDay: number;
}

export type Fit = { ok: true } | { ok: false; reason: FitFailure };

const floorIndex = (windowStart: Date, t: Date) =>
  Math.floor((t.getTime() - windowStart.getTime()) / BUCKET_MS);
const ceilIndex = (windowStart: Date, t: Date) =>
  Math.ceil((t.getTime() - windowStart.getTime()) / BUCKET_MS);

/** Buckets fully inside one of the intervals. */
function coveredMask(n: number, windowStart: Date, intervals: readonly Interval[]): Uint8Array {
  const mask = new Uint8Array(n);
  for (const { start, end } of intervals) {
    const from = Math.max(0, ceilIndex(windowStart, start));
    const to = Math.min(n, floorIndex(windowStart, end));
    for (let i = from; i < to; i++) mask[i] = 1;
  }
  return mask;
}

/** Bucket range `[from, to)` an interval touches, clipped to the window. */
function touched(n: number, windowStart: Date, start: Date, end: Date): [number, number] {
  return [Math.max(0, floorIndex(windowStart, start)), Math.min(n, ceilIndex(windowStart, end))];
}

export function buildResourceDay(input: ResourceDayInput): ResourceDay {
  const windowStart = input.day.start;
  const windowEnd = input.day.end.getTime() + OVERHANG_MS;
  const n = Math.ceil((windowEnd - windowStart.getTime()) / BUCKET_MS);
  const siteOpen = coveredMask(n, windowStart, input.siteOpen);
  const resourceOpen = input.resourceOpen && coveredMask(n, windowStart, input.resourceOpen);
  const capacity = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const open = siteOpen[i] === 1 && (!resourceOpen || resourceOpen[i] === 1);
    capacity[i] = open ? input.baseCapacity : 0;
  }
  for (const { start, end } of input.closed) {
    const [from, to] = touched(n, windowStart, start, end);
    capacity.fill(0, from, Math.max(from, to));
  }
  const load = new Int32Array(n);
  let startsOnDay = 0;
  for (const b of input.load) {
    const [from, to] = touched(n, windowStart, b.startsAt, b.blocksUntil);
    for (let i = from; i < to; i++) load[i] = (load[i] ?? 0) + 1;
    if (b.startsAt >= input.day.start && b.startsAt < input.day.end) startsOnDay++;
  }
  return { day: input.day, windowStart, dailyCap: input.dailyCap, capacity, load, startsOnDay };
}

/**
 * Whether a booking of `blockMinutes` (duration plus buffer) fits at `startsAt`, which lies on
 * the day. `closed`: some bucket has no capacity at all (outside hours, closure, no active dock).
 */
export function checkFit(day: ResourceDay, startsAt: Date, blockMinutes: number): Fit {
  if (startsAt < day.day.start || startsAt >= day.day.end) {
    throw new Error(`${startsAt.toISOString()} is not on the timeline's day`);
  }
  const end = new Date(startsAt.getTime() + blockMinutes * 60_000);
  const [from, to] = touched(day.capacity.length, day.windowStart, startsAt, end);
  let full = false;
  for (let i = from; i < to; i++) {
    const capacity = day.capacity[i] ?? 0;
    if (capacity === 0) return { ok: false, reason: FitFailure.closed };
    if ((day.load[i] ?? 0) >= capacity) full = true;
  }
  if (day.dailyCap !== null && day.startsOnDay >= day.dailyCap) {
    return { ok: false, reason: FitFailure.daily_cap_reached };
  }
  return full ? { ok: false, reason: FitFailure.capacity_full } : { ok: true };
}

/** The grid slots of the day that fit, inside `bounds` (lead time and horizon) when given. */
export function offeredSlots(
  day: ResourceDay,
  grid: readonly GridSlot[],
  blockMinutes: number,
  bounds: Interval | null,
): GridSlot[] {
  return grid.filter(
    (slot) =>
      slot.start >= day.day.start &&
      slot.start < day.day.end &&
      (!bounds || (slot.start >= bounds.start && slot.start <= bounds.end)) &&
      checkFit(day, slot.start, blockMinutes).ok,
  );
}

/** MD-03: a booking is over capacity when a bucket it occupies holds more load than capacity. */
export function isOverCapacity(day: ResourceDay, booking: LoadInterval): boolean {
  const [from, to] = touched(
    day.capacity.length,
    day.windowStart,
    booking.startsAt,
    booking.blocksUntil,
  );
  for (let i = from; i < to; i++) {
    if ((day.load[i] ?? 0) > (day.capacity[i] ?? 0)) return true;
  }
  return false;
}
