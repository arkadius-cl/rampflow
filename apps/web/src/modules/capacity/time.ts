import type { StaffLocale } from '@rampflow/shared';
import {
  type LocalDateTime,
  localDateTimeToInstant,
  siteTimeParts,
  type TimeZone,
} from '@rampflow/shared/time';

// Display of the local wall-clock values the capacity screens edit (ADR-0012): weekly hours and
// closures are site-local, so they show with the site zone's short names, never converted.

/** "CET/CEST" for Europe/Berlin: the zone's short names in winter and summer. */
export function zoneNames(zone: string, locale: StaffLocale): string {
  const names = [0, 6].map(
    (month) =>
      siteTimeParts(new Date(Date.UTC(2026, month, 15, 12)), zone as TimeZone, locale).zone,
  );
  return [...new Set(names)].join('/');
}

/** The short zone name in effect at a site-local date and time. */
export const zoneAt = (value: string, zone: string, locale: StaffLocale) =>
  siteTimeParts(
    localDateTimeToInstant(value as LocalDateTime, zone as TimeZone),
    zone as TimeZone,
    locale,
  ).zone;

/** "Mon" or "Monday" for ISO weekday 1 to 7. */
export function weekdayName(
  weekday: number,
  locale: StaffLocale,
  style: 'short' | 'long' = 'long',
) {
  // 2024-01-01 is a Monday.
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, weekday)),
  );
}

/** A site-local calendar date ("2026-12-25") in the user's language, without zone shifts. */
export function formatLocalDate(day: string, locale: StaffLocale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${day.slice(0, 10)}T00:00:00Z`));
}
