import { useLocale } from '@/lib/i18n';

// Numbers and instants in the viewer's language. Invitation and override expiry belong to no
// site, so they show in the viewer's own zone with its short name ("Mon, 19 Oct 2026, 08:30 CEST").

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
  return {
    number: (n: number) => numbers.format(n),
    instant: (iso: string) => instants.format(new Date(iso)),
  };
}
