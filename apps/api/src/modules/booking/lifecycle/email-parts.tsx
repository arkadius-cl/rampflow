import type { DriverLocale, StaffLocale } from '@rampflow/shared';
import { formatSiteTime, type TimeZone } from '@rampflow/shared/time';
import { Heading, Section, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { encode } from 'uqr';

// Pieces of the booking emails. Payloads carry display data and row ids, never tokens, links or
// personal data (ADR-0010); times stay instants and are formatted in the site zone at send time.

export interface EmailSite {
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  country: string;
  phone: string | null;
}

export interface BookingEmailPayload {
  locale: StaffLocale;
  bookingId: string;
  code: string;
  site: EmailSite;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  loadTypeName: { de: string; en: string };
  carrierName: string;
}

const DATE_TAG: Partial<Record<StaffLocale | DriverLocale, string>> = { en: 'en-GB' };

/** "Mon 2 Nov 2026, 09:00 CET – 09:30 CET" in the site zone with the recipient's zone label. */
export function formatSlot(
  startsAt: string,
  endsAt: string,
  zone: string,
  locale: StaffLocale | DriverLocale,
): string {
  const tz = zone as TimeZone;
  const start = new Date(startsAt);
  const date = new Intl.DateTimeFormat(DATE_TAG[locale] ?? locale, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(start);
  return `${date}, ${formatSiteTime(start, tz, locale)} – ${formatSiteTime(new Date(endsAt), tz, locale)}`;
}

export const addressLines = (s: EmailSite) =>
  [s.addressLine1, s.addressLine2, `${s.postalCode} ${s.city}`, s.country].filter(
    (l): l is string => Boolean(l),
  );

const label = { color: '#71717a', fontSize: '12px', margin: '12px 0 0' };
const value = { fontSize: '15px', margin: '2px 0 0' };

/** The booking facts every booking email repeats. */
export function BookingFacts(props: { p: BookingEmailPayload; t: TFunction }) {
  const { p, t } = props;
  const loadType = p.locale === 'de' ? p.loadTypeName.de : p.loadTypeName.en;
  return (
    <Section>
      <Text style={label}>{t('booking.email.code')}</Text>
      <Text style={{ ...value, fontSize: '22px', fontWeight: 700, letterSpacing: '2px' }}>
        {p.code}
      </Text>
      <Text style={label}>{t('booking.email.slot')}</Text>
      <Text style={value}>{formatSlot(p.startsAt, p.endsAt, p.timeZone, p.locale)}</Text>
      <Text style={label}>{t('booking.email.site')}</Text>
      <Text style={value}>
        {[p.site.name, ...addressLines(p.site)].join(', ')}
        {p.site.phone ? ` · ${p.site.phone}` : ''}
      </Text>
      <Text style={label}>{t('booking.email.loadType')}</Text>
      <Text style={value}>{loadType}</Text>
      <Text style={label}>{t('booking.email.carrier')}</Text>
      <Text style={value}>{p.carrierName}</Text>
    </Section>
  );
}

/** The booking code as a QR code built from table cells, which every mail client renders. */
export function CodeQr(props: { code: string; caption: string }) {
  const { data } = encode(props.code, { ecc: 'M', border: 2 });
  const cell = 4;
  return (
    <Section>
      <Heading as="h3" style={{ fontSize: '14px', margin: '16px 0 4px' }}>
        {props.caption}
      </Heading>
      <table
        role="img"
        aria-label={props.code}
        cellPadding={0}
        cellSpacing={0}
        style={{ borderCollapse: 'collapse' }}
      >
        <tbody>
          {data.map((row, y) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a QR row has no identity but its index
            <tr key={y}>
              {row.map((dark, x) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: a QR module has no identity but its index
                  key={x}
                  width={cell}
                  height={cell}
                  style={{
                    width: `${cell}px`,
                    height: `${cell}px`,
                    padding: 0,
                    backgroundColor: dark ? '#000000' : '#ffffff',
                  }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
