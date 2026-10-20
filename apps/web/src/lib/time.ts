import { siteTimeParts, type TimeZone, viewerTime } from '@rampflow/shared/time';
import type { StaffLocale } from '@rampflow/shared/values';
import { useLocale } from './i18n';

// Site time for display (ADR-0012, "Display"), on the shared time module: the wall clock of the
// site's zone with the zone's short name, plus the viewer's own time when their zone shows
// another wall clock. Screens render it with <SiteTime {...siteTime(...)} />, the only way to
// show a time.

export interface SiteTimeParts {
  /** HH:mm in the site zone. */
  time: string;
  /** The zone's short name in the viewer's language, for example "CET" or "MEZ". */
  zone: string;
  /** HH:mm in the viewer's zone, only when it differs from the site's. */
  viewerTime?: string;
}

export const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone as TimeZone;

export function siteTime(
  instant: Date | string,
  timeZone: string,
  locale: StaffLocale,
  viewerZone: TimeZone = viewerTimeZone(),
): SiteTimeParts {
  const at = typeof instant === 'string' ? new Date(instant) : instant;
  const site = siteTimeParts(at, timeZone as TimeZone, locale);
  const viewer = viewerTime(at, timeZone as TimeZone, viewerZone, locale);
  return viewer ? { ...site, viewerTime: viewer.time } : site;
}

/** `siteTime` bound to the UI language. */
export function useSiteTime() {
  const locale = useLocale();
  return (instant: Date | string, timeZone: string) => siteTime(instant, timeZone, locale);
}
