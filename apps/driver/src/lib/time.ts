import type { DriverLocale } from '@rampflow/shared/locales';
import { formatSiteTime, siteTimeParts, type TimeZone } from '@rampflow/shared/time';

// Site time for the driver (ADR-0012): the wall clock of the site's zone, always with the zone
// label, whatever zone the phone is in.

export const timeAt = (instant: string, zone: string, locale: DriverLocale) =>
  siteTimeParts(new Date(instant), zone as TimeZone, locale);

/** "08:30 CET" as one string, for sentences. */
export const siteTimeLabel = (instant: string, zone: string, locale: DriverLocale) =>
  formatSiteTime(new Date(instant), zone as TimeZone, locale);

/** "Mon, 2 Nov 2026" in the site's calendar. */
export const dayAt = (instant: string, zone: string, locale: DriverLocale) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(instant));

/** "2 Nov 2027" without a time, for expiries. */
export const dateAt = (instant: string, zone: string, locale: DriverLocale) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(instant));
