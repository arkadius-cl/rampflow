import { useLocale } from '@/lib/i18n';

/**
 * A calendar date in the viewer's language, for when a link or an invitation began or ends.
 * These belong to no site, so they carry no site zone; slot times use lib/time.ts instead.
 */
export function useDate() {
  const locale = useLocale();
  const format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  return (iso: string) => format.format(new Date(iso));
}

/** A country's name in the viewer's language, for example "Litauen" for LT. */
export function useCountryName() {
  const locale = useLocale();
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return (code: string | null) => (code ? (names.of(code) ?? code) : '');
}
