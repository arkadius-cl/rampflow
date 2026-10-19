import { tzOffset } from '@date-fns/tz';
import * as z from 'zod';
import type { DriverLocale, StaffLocale } from '../locales.ts';

// Calendar math for sites (ADR-0012). Instants are UTC `Date`s; local values are branded strings.
// Pure: runs in the API, the web app and the driver PWA.

export type TimeZone = string & z.$brand<'TimeZone'>;
/** `YYYY-MM-DD` in a site's calendar. */
export type LocalDate = string & z.$brand<'LocalDate'>;
/** `HH:mm` wall time; `24:00` only as a closing time. */
export type LocalTime = string & z.$brand<'LocalTime'>;
/** `YYYY-MM-DDTHH:mm` wall time in a site's calendar (closures). */
export type LocalDateTime = string & z.$brand<'LocalDateTime'>;

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .min(1)
  .refine(isTimeZone, { message: 'Unknown IANA time zone' })
  .brand<'TimeZone'>();

export const localDateSchema = z.iso.date().brand<'LocalDate'>();
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm')
  .brand<'LocalTime'>();
/** Like `localTimeSchema`, plus `24:00` (the start of the next day). */
export const closingTimeSchema = z
  .string()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Expected HH:mm or 24:00')
  .brand<'LocalTime'>();
export const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Expected YYYY-MM-DDTHH:mm')
  .refine((v) => localDateSchema.safeParse(v.slice(0, 10)).success, 'Invalid date')
  .brand<'LocalDateTime'>();

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

/** Wall-clock minutes since 1970-01-01 00:00, ignoring zones: arithmetic on local values. */
function naiveMinutes(day: LocalDate, time: LocalTime): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const [h, min] = time.split(':').map(Number) as [number, number];
  return Date.UTC(y, m - 1, d, h, min) / MINUTE;
}

function fromNaive(minutes: number): { day: LocalDate; time: LocalTime } {
  const iso = new Date(minutes * MINUTE).toISOString();
  return { day: iso.slice(0, 10) as LocalDate, time: iso.slice(11, 16) as LocalTime };
}

export function addDays(day: LocalDate, days: number): LocalDate {
  return fromNaive(naiveMinutes(day, '00:00' as LocalTime) + days * DAY_MINUTES).day;
}

/** ISO weekday, 1 (Monday) to 7 (Sunday). */
export function isoWeekday(day: LocalDate): number {
  const weekday = new Date(naiveMinutes(day, '00:00' as LocalTime) * MINUTE).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(zone: TimeZone): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The wall clock of `instant` in `zone`. */
export function wallClock(instant: Date, zone: TimeZone): { day: LocalDate; time: LocalTime } {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFormatter(zone).formatToParts(instant)) p[type] = value;
  return {
    day: `${p.year}-${p.month}-${p.day}` as LocalDate,
    time: `${p.hour}:${p.minute}` as LocalTime,
  };
}

export function siteDay(instant: Date, zone: TimeZone): LocalDate {
  return wallClock(instant, zone).day;
}

export function toLocalDateTime(instant: Date, zone: TimeZone): LocalDateTime {
  const { day, time } = wallClock(instant, zone);
  return `${day}T${time}` as LocalDateTime;
}

/**
 * Every instant whose wall time in `zone` is `day time`: none in a spring-forward gap, two in an
 * autumn fold, ascending. `24:00` is the start of the next local day.
 */
export function instantsAt(day: LocalDate, time: LocalTime, zone: TimeZone): Date[] {
  if (time === '24:00') return [localDayRange(day, zone).end];
  const naive = naiveMinutes(day, time) * MINUTE;
  const midnight = naiveMinutes(day, '00:00' as LocalTime) * MINUTE;
  const offsets = new Set<number>();
  for (let k = -1; k <= 2; k++) offsets.add(tzOffset(zone, new Date(midnight + k * 86_400_000)));
  const found = new Set<number>();
  for (const offset of offsets) {
    const utc = naive - offset * MINUTE;
    const back = wallClock(new Date(utc), zone);
    if (back.day === day && back.time === time) found.add(utc);
  }
  return [...found].sort((a, b) => a - b).map((ms) => new Date(ms));
}

/**
 * The first instant at or after the wall time `day time`: the time itself, the earlier instant
 * of a fold, or the end of a gap. Window and closure bounds convert with it.
 */
export function firstInstantFrom(day: LocalDate, time: LocalTime, zone: TimeZone): Date {
  if (time === '24:00') return localDayRange(day, zone).end;
  let naive = naiveMinutes(day, time);
  for (let i = 0; i <= DAY_MINUTES; i++, naive++) {
    const wall = fromNaive(naive);
    const [first] = instantsAt(wall.day, wall.time, zone);
    if (first) return first;
  }
  throw new Error(`No instant after ${day} ${time} in ${zone}`);
}

export function localDateTimeToInstant(value: LocalDateTime, zone: TimeZone): Date {
  return firstInstantFrom(value.slice(0, 10) as LocalDate, value.slice(11, 16) as LocalTime, zone);
}

/** The instants of one site-local day, `[start, end)`: 23, 24 or 25 hours. */
export function localDayRange(day: LocalDate, zone: TimeZone): { start: Date; end: Date } {
  return {
    start: firstInstantFrom(day, '00:00' as LocalTime, zone),
    end: firstInstantFrom(addDays(day, 1), '00:00' as LocalTime, zone),
  };
}

export interface GridSlot {
  start: Date;
  wallTime: LocalTime;
  /** Which of the two instants of an autumn-fold wall time; `null` outside folds. */
  fold: 'earlier' | 'later' | null;
}

/** The slot grid of one site-local day: wall times every `gridMinutes`, gaps skipped, folds doubled. */
export function slotGrid(day: LocalDate, zone: TimeZone, gridMinutes: number): GridSlot[] {
  const slots: GridSlot[] = [];
  for (let minute = 0; minute < DAY_MINUTES; minute += gridMinutes) {
    const wallTime = fromNaive(minute).time;
    const instants = instantsAt(day, wallTime, zone);
    instants.forEach((start, i) => {
      const fold = instants.length === 2 ? (i === 0 ? 'earlier' : 'later') : null;
      slots.push({ start, wallTime, fold });
    });
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Formatting tags per UI locale: plain `en` would print "GMT+1" instead of "CET" (ADR-0012). */
const FORMAT_TAG: Partial<Record<StaffLocale | DriverLocale, string>> = { en: 'en-GB' };

const labelFormatters = new Map<string, Intl.DateTimeFormat>();
function labelFormatter(zone: TimeZone, locale: StaffLocale | DriverLocale) {
  const key = `${zone}|${locale}`;
  let f = labelFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(FORMAT_TAG[locale] ?? locale, {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    });
    labelFormatters.set(key, f);
  }
  return f;
}

/** `{ time: '08:30', zone: 'CET' }`, the parts `<SiteTime>` renders. */
export function siteTimeParts(
  instant: Date,
  zone: TimeZone,
  locale: StaffLocale | DriverLocale,
): { time: string; zone: string } {
  const parts = labelFormatter(zone, locale).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return { time: `${pick('hour')}:${pick('minute')}`, zone: pick('timeZoneName') ?? zone };
}

/** "08:30 CET" in the site zone with the zone label of `locale`. */
export function formatSiteTime(
  instant: Date,
  zone: TimeZone,
  locale: StaffLocale | DriverLocale,
): string {
  const parts = siteTimeParts(instant, zone, locale);
  return `${parts.time} ${parts.zone}`;
}

/** The viewer's wall time when it differs from the site's at `instant`, else `null` (the UI hint). */
export function viewerTime(
  instant: Date,
  siteZone: TimeZone,
  viewerZone: TimeZone,
  locale: StaffLocale | DriverLocale,
): { time: string; zone: string } | null {
  if (tzOffset(siteZone, instant) === tzOffset(viewerZone, instant)) return null;
  return siteTimeParts(instant, viewerZone, locale);
}
