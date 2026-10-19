import { siteDay, type TimeZone } from '@rampflow/shared/time';
import { linkExpiryFor } from '../../driver/access.ts';

// Pure guards and derived instants of the lifecycle commands (ADR-0005, point 3).

const MINUTE = 60_000;

/** Carriers change or cancel only before `starts_at - booking.cancel_cutoff_minutes` (BK-05). */
export const cutoffAt = (startsAt: Date, cutoffMinutes: number) =>
  new Date(startsAt.getTime() - cutoffMinutes * MINUTE);

export const isPastCutoff = (now: Date, startsAt: Date, cutoffMinutes: number) =>
  now >= cutoffAt(startsAt, cutoffMinutes);

/** BK-08: a confirmed booking becomes `no_show` at `starts_at + yard.no_show_after_minutes`. */
export const noShowDueAt = (startsAt: Date, afterMinutes: number) =>
  new Date(startsAt.getTime() + afterMinutes * MINUTE);

/**
 * YD-02: a `no_show` booking checks in only on the site-local day of `no_show_at`, so a 23:30
 * slot marked at 00:30 still checks in that night, and nobody checks in the day after.
 */
export const noShowCheckInOpen = (now: Date, noShowAt: Date, zone: TimeZone) =>
  siteDay(now, zone) === siteDay(noShowAt, zone);

/** Departure and turn-away: `min(at + privacy.retention.driver_link_hours, starts_at + 7 days)`. */
export function visitEndLinkExpiry(at: Date, startsAt: Date, retentionHours: number): Date {
  const byRetention = at.getTime() + retentionHours * 60 * MINUTE;
  return new Date(Math.min(byRetention, linkExpiryFor(startsAt).getTime()));
}

/** Signed minutes of a check-in against the slot start. */
export const minutesFromStart = (at: Date, startsAt: Date) =>
  Math.round((at.getTime() - startsAt.getTime()) / MINUTE);
