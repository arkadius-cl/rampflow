import type { BookingView } from '@rampflow/shared/modules/booking/api.staff';
import { SafetyStatus } from '@rampflow/shared/modules/safety/values';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BanIcon, CalendarClockIcon, ExternalLinkIcon, PhoneIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SiteTime } from '@/components/site-time';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useSiteTime } from '@/lib/time';
import { CancelDialog, LockReason, RescheduleDialog, useChangeAccess } from './actions';
import {
  BookingFlagBadge,
  BookingSafetyBadge,
  BookingStatusBadge,
  flagsOf,
  PunctualityBadge,
  useLoadTypeName,
} from './display';
import { bookingEventsQuery, bookingQuery } from './queries';
import { BookingTimeline } from './timeline';

// BK-01, BK-03: the side panel of the plan board. Summary, reschedule and cancel before
// check-in, and the timeline; "Open" leads to the full booking page.

export function DetailPanel({
  orgId,
  bookingId,
  overCapacity,
  onClose,
}: {
  orgId: string;
  bookingId: string;
  /** From the board: the API's detail view does not carry the over-capacity flag. */
  overCapacity: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('booking');
  const booking = useQuery(bookingQuery(orgId, bookingId));
  const events = useQuery(bookingEventsQuery(orgId, bookingId));
  return (
    <aside
      className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-background p-4 xl:w-96"
      aria-label={t(($) => $.plan.detail.label)}
    >
      {booking.data ? (
        <PanelBody
          orgId={orgId}
          booking={booking.data}
          overCapacity={overCapacity}
          onClose={onClose}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t(($) => $.plan.actions.close)}
              onClick={onClose}
            >
              <XIcon />
            </Button>
          </div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {booking.data ? (
        <>
          <Separator />
          <section>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t(($) => $.plan.detail.timeline)}
            </h3>
            <BookingTimeline events={events.data} timeZone={booking.data.timeZone} />
          </section>
        </>
      ) : null}
    </aside>
  );
}

function PanelBody({
  orgId,
  booking,
  overCapacity,
  onClose,
}: {
  orgId: string;
  booking: BookingView;
  overCapacity: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('booking');
  const { t: tAvis } = useTranslation('avis');
  const siteTime = useSiteTime();
  const loadTypeName = useLoadTypeName();
  const change = useChangeAccess(booking.status);
  const [dialog, setDialog] = useState<'reschedule' | 'cancel' | null>(null);
  const zone = booking.timeZone;
  const flags = flagsOf({ ...booking, overCapacity });

  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-muted-foreground">{booking.code}</div>
          <h2 className="truncate text-lg font-semibold">{booking.carrierName}</h2>
          <div className="mt-1 flex flex-wrap gap-1">
            <BookingStatusBadge status={booking.status} />
            {booking.safety.status === SafetyStatus.not_required ? null : (
              <BookingSafetyBadge status={booking.safety.status} />
            )}
            {booking.punctuality ? (
              <PunctualityBadge
                punctuality={booking.punctuality}
                minutes={booking.punctualityMinutes}
              />
            ) : null}
            {flags.map((f) => (
              <BookingFlagBadge key={f} flag={f} />
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t(($) => $.plan.actions.close)}
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t(($) => $.plan.detail.slot)}</dt>
        <dd>
          <SiteTime {...siteTime(booking.startsAt, zone)} />
          <span aria-hidden> – </span>
          <span className="sr-only">{t(($) => $.plan.detail.to)}</span>
          <SiteTime {...siteTime(booking.endsAt, zone)} viewerTime={undefined} />
        </dd>
        <dt className="text-muted-foreground">{t(($) => $.plan.detail.resource)}</dt>
        <dd>
          {booking.resource.name}
          {booking.dock ? ` · ${booking.dock.code}` : ''}
        </dd>
        <dt className="text-muted-foreground">{t(($) => $.plan.detail.load)}</dt>
        <dd>
          {t(($) => $.plan.board.units, { n: booking.loadUnits })} ·{' '}
          {loadTypeName(booking.loadType.name)}
        </dd>
        <dt className="text-muted-foreground">{tAvis(($) => $.avis.field.plate)}</dt>
        <dd className="font-mono">{booking.avis?.vehicle.plate ?? '–'}</dd>
        <dt className="text-muted-foreground">{tAvis(($) => $.avis.field.references)}</dt>
        <dd className="break-words">
          {booking.avis?.references.map((r) => r.value).join(', ') || '–'}
        </dd>
        <dt className="text-muted-foreground">{t(($) => $.plan.avis.driver)}</dt>
        <dd>
          {booking.avis?.driver.phone ? (
            <a
              href={`tel:${booking.avis.driver.phone}`}
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <PhoneIcon className="size-3.5" aria-hidden />
              {booking.avis.driver.phone}
            </a>
          ) : (
            (booking.avis?.driver.name ?? '–')
          )}
        </dd>
      </dl>

      {overCapacity ? (
        <Alert className="border-tone-danger-border bg-tone-danger-bg text-tone-danger">
          <AlertDescription className="text-tone-danger">
            {t(($) => $.plan.detail.over_capacity)}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Link
          to="/t/$orgId/bookings/$bookingId"
          params={{ orgId, bookingId: booking.id }}
          className={buttonVariants({ size: 'sm' })}
        >
          <ExternalLinkIcon />
          {t(($) => $.plan.actions.open)}
        </Link>
        {change.lock === 'no_permission' ? null : (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!change.canReschedule}
              onClick={() => setDialog('reschedule')}
            >
              <CalendarClockIcon />
              {t(($) => $.plan.actions.reschedule)}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!change.canCancel}
              className="text-destructive"
              onClick={() => setDialog('cancel')}
            >
              <BanIcon />
              {t(($) => $.plan.actions.cancel)}
            </Button>
            {change.lock ? <LockReason lock={change.lock} status={booking.status} /> : null}
          </>
        )}
      </div>

      <RescheduleDialog
        orgId={orgId}
        booking={booking}
        open={dialog === 'reschedule'}
        onOpenChange={(open) => setDialog(open ? 'reschedule' : null)}
      />
      <CancelDialog
        orgId={orgId}
        booking={booking}
        open={dialog === 'cancel'}
        onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
      />
    </>
  );
}
