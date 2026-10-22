import { useLocale } from '@/lib/i18n';

// Numbers and instants in the viewer's language. Invitation and override expiry belong to no
// site, so they show in the viewer's own zone with its short name ("Mon, 19 Oct 2026, 08:30 CEST").

/** Thresholds from seconds upward; the first unit whose span the difference does not reach wins. */
const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

export function useFormat() {
  const locale = useLocale();
  const numbers = new Intl.NumberFormat(locale);
  const instants = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  });
  const relatives = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return {
    number: (n: number) => numbers.format(n),
    instant: (iso: string) => instants.format(new Date(iso)),
    /** "3 days ago", "in 2 hours": the distance from `now` in the largest fitting unit. */
    relative: (iso: string, now = Date.now()) => {
      let value = (new Date(iso).getTime() - now) / 1000;
      for (const [unit, span] of RELATIVE_UNITS) {
        if (Math.abs(value) < span) return relatives.format(Math.round(value), unit);
        value /= span;
      }
      return relatives.format(Math.round(value), 'year');
    },
  };
}
