import type { StaffLocale } from '@rampflow/shared';
import { useLocale } from './i18n';

// Site time for display (ADR-0012, "Display"): the wall clock of the site's zone with the zone's
// short name, plus the viewer's own time when the viewer sits in another zone. `en` formats as
// en-GB, which names European zones ("CET") where plain `en` says "GMT+1". Screens render the
// result with <SiteTime {...siteTime(...)} />, the only way to show a time.

const FORMAT_LOCALE: Record<StaffLocale, string> = { de: 'de', en: 'en-GB', pl: 'pl' };

export interface SiteTimeParts {
  /** HH:mm in the site zone. */
  time: string;
  /** The zone's short name in the viewer's language, for example "CET" or "MEZ". */
  zone: string;
  /** HH:mm in the viewer's zone, only when that zone shows another wall clock. */
  viewerTime?: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: StaffLocale, timeZone: string, zoneName: boolean) {
  const key = `${locale}|${timeZone}|${zoneName}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(FORMAT_LOCALE[locale], {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(zoneName ? { timeZoneName: 'short' } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

export const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function siteTime(
  instant: Date | string,
  timeZone: string,
  locale: StaffLocale,
  viewerZone: string = viewerTimeZone(),
): SiteTimeParts {
  const at = typeof instant === 'string' ? new Date(instant) : instant;
  const parts = formatter(locale, timeZone, true).formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  const time = `${pick('hour')}:${pick('minute')}`;
  const zone = pick('timeZoneName') ?? timeZone;
  const viewer = formatter(locale, viewerZone, false).format(at);
  return viewer === time ? { time, zone } : { time, zone, viewerTime: viewer };
}

/** `siteTime` bound to the UI language. */
export function useSiteTime() {
  const locale = useLocale();
  return (instant: Date | string, timeZone: string) => siteTime(instant, timeZone, locale);
}
