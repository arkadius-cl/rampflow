import type { PortalAddress, PortalBookingView } from '@rampflow/shared/modules/booking/api.portal';
import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import { type LocalDate, siteDay, type TimeZone } from '@rampflow/shared/time';
import { StaffLocale } from '@rampflow/shared/values';
import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { encode } from 'uqr';
import { SiteTime } from '@/components/site-time';
import { useLocale } from '@/lib/i18n';
import { type SiteTimeParts, useSiteTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useDayLabel } from '@/modules/booking/display';

// Pieces of the confirmation and the booking page (BK-04, BK-05, CR-05): the QR code of the
// booking code, the slot in site time with the zone, the site address and the change cutoff.

/** The booking code as a QR code for the gate scanner; never the driver link token (ADR-0008). */
export function CodeQr({
  value,
  label,
  size = 160,
  className,
}: {
  value: string;
  label: string;
  size?: number;
  className?: string;
}) {
  const { path, modules } = useMemo(() => {
    const { data } = encode(value, { border: 2 });
    let d = '';
    data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { path: d, modules: data.length };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${modules} ${modules}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn('shrink-0 rounded-md border bg-white', className)}
    >
      {/* design-check-ignore: QR modules stay black on white for scanners */}
      <path d={path} fill="#000" />
    </svg>
  );
}

/** The short day of the design system ("Do 15.10."), for one-line table cells. */
function useShortDayLabel() {
  const locale = useLocale();
  const format = new Intl.DateTimeFormat(locale === StaffLocale.en ? 'en-GB' : locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
  return (day: LocalDate) => format.format(new Date(`${day}T00:00:00Z`));
}

/**
 * Several times of one zone on one line, the zone and the viewer's time once:
 * "09:30 – 10:30 CEST (07:30 – 08:30 your time)". A missing time reads "–".
 */
export function SiteTimes({
  parts,
  separator,
  separatorLabel,
  className,
}: {
  parts: (SiteTimeParts | null)[];
  separator: string;
  /** What a screen reader hears instead of the separator. */
  separatorLabel: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const zone = parts.find((p) => p !== null)?.zone;
  const viewerTimes = parts.flatMap((p) => (p?.viewerTime ? [p.viewerTime] : []));
  const viewer = viewerTimes.length > 0 ? viewerTimes.join(` ${separator} `) : null;
  return (
    <span className={cn('tabular-nums', className)}>
      {parts.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positions are the identity of a slot's ends
        <span key={i}>
          {i > 0 ? (
            <>
              <span aria-hidden> {separator} </span>
              <span className="sr-only"> {separatorLabel} </span>
            </>
          ) : null}
          {p ? <time>{p.time}</time> : <span className="text-muted-foreground">–</span>}
        </span>
      ))}
      {zone ? (
        <span className="ml-1 text-[0.8em] font-medium text-muted-foreground">{zone}</span>
      ) : null}
      {viewer ? (
        <span className="ml-1 text-[0.8em] text-muted-foreground">
          {t(($) => $.shell.viewer_time, { time: viewer })}
        </span>
      ) : null}
    </span>
  );
}

/** "Mon 2 Nov 2026, 09:00 CET – 10:00 CET" in the site's zone; `short` is the one-line table form. */
export function SlotText({
  startsAt,
  endsAt,
  timeZone,
  short = false,
}: {
  startsAt: string;
  endsAt: string;
  timeZone: string;
  short?: boolean;
}) {
  const { t } = useTranslation('booking');
  const dayLabel = useDayLabel();
  const shortDayLabel = useShortDayLabel();
  const siteTime = useSiteTime();
  const day = siteDay(new Date(startsAt), timeZone as TimeZone);
  if (short) {
    return (
      <span>
        {shortDayLabel(day)},{' '}
        <SiteTimes
          parts={[siteTime(startsAt, timeZone), siteTime(endsAt, timeZone)]}
          separator="–"
          separatorLabel={t(($) => $.portal.slot.to)}
        />
      </span>
    );
  }
  return (
    <span>
      {dayLabel(day)}, <SiteTime {...siteTime(startsAt, timeZone)} />
      <span aria-hidden> – </span>
      <span className="sr-only"> {t(($) => $.portal.slot.to)} </span>
      <SiteTime {...siteTime(endsAt, timeZone)} />
    </span>
  );
}

export function AddressLines({ address }: { address: PortalAddress }) {
  return (
    <address className="not-italic">
      {address.line1}
      {address.line2 ? <span className="block">{address.line2}</span> : null}
      <span className="block">
        {address.postalCode} {address.city}, {address.country}
      </span>
    </address>
  );
}

/** Whether the carrier may still change or cancel: confirmed and before the cutoff (BK-05). */
export const beforeCutoff = (b: Pick<PortalBookingView, 'status' | 'cutoffAt'>, now = Date.now()) =>
  b.status === BookingStatus.confirmed && now < Date.parse(b.cutoffAt);

/** BK-05: until when changes are free, or the site phone once they are closed. */
export function CutoffNote({
  booking,
  className,
}: {
  booking: Pick<PortalBookingView, 'status' | 'cutoffAt' | 'timeZone'> & {
    site: { phone: string | null };
  };
  className?: string;
}) {
  const { t } = useTranslation('booking');
  const dayLabel = useDayLabel();
  const siteTime = useSiteTime();
  if (booking.status !== BookingStatus.confirmed) return null;
  if (beforeCutoff(booking)) {
    return (
      <span className={className}>
        {t(($) => $.portal.cutoff.until)}{' '}
        {dayLabel(siteDay(new Date(booking.cutoffAt), booking.timeZone))}{' '}
        <SiteTime {...siteTime(booking.cutoffAt, booking.timeZone)} />
      </span>
    );
  }
  const phone = booking.site.phone;
  return (
    <span className={className}>
      {t(($) => $.portal.cutoff.passed)}{' '}
      {phone ? (
        <>
          {t(($) => $.portal.cutoff.call)}{' '}
          <a className="font-medium underline underline-offset-2" href={`tel:${phone}`}>
            {phone}
          </a>
        </>
      ) : (
        t(($) => $.portal.cutoff.no_phone)
      )}
    </span>
  );
}
