import type { PortalAddress, PortalBookingView } from '@rampflow/shared/modules/booking/api.portal';
import { siteDay, type TimeZone } from '@rampflow/shared/time';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { encode } from 'uqr';
import { SiteTime } from '@/components/site-time';
import { useSiteTime } from '@/lib/time';
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
      <path d={path} fill="#000" />
    </svg>
  );
}

/** "Mon 2 Nov 2026, 09:00 CET – 10:00 CET" in the site's zone. */
export function SlotText({
  startsAt,
  endsAt,
  timeZone,
}: {
  startsAt: string;
  endsAt: string;
  timeZone: string;
}) {
  const { t } = useTranslation('booking');
  const dayLabel = useDayLabel();
  const siteTime = useSiteTime();
  return (
    <span>
      {dayLabel(siteDay(new Date(startsAt), timeZone as TimeZone))},{' '}
      <SiteTime {...siteTime(startsAt, timeZone)} />
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
  b.status === 'confirmed' && now < Date.parse(b.cutoffAt);

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
  if (booking.status !== 'confirmed') return null;
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
