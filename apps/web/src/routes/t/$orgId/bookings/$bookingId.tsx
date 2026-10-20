import type { Avis } from '@rampflow/shared/modules/avis/avis';
import type {
  BookingView,
  DriverLinkView,
  PutAvis,
} from '@rampflow/shared/modules/booking/api.staff';
import { BookingDialog, ChangeLock } from '@rampflow/shared/modules/booking/values';
import { SafetyStatus } from '@rampflow/shared/modules/safety/values';
import { siteDay, type TimeZone } from '@rampflow/shared/time';
import { BadgeSize, ConflictReason, ErrorCode, Permission } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  BanIcon,
  CalendarClockIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorText } from '@/components/app-shell/form-errors';
import { SiteTime } from '@/components/site-time';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { guard, useAccess } from '@/lib/access';
import { ApiFailure, api, call } from '@/lib/api';
import { useSiteTime } from '@/lib/time';
import {
  CancelDialog,
  LockReason,
  RescheduleDialog,
  useChangeAccess,
} from '@/modules/booking/actions';
import {
  AvisFields,
  type AvisFormValues,
  applyAvisIssues,
  avisFormValues,
  avisResolver,
  useAvisRules,
} from '@/modules/booking/avis-form';
import { AvisSummary } from '@/modules/booking/avis-summary';
import {
  BookingFlagBadge,
  BookingSafetyBadge,
  BookingStatusBadge,
  flagsOf,
  PunctualityBadge,
  useDayLabel,
  useLoadTypeName,
} from '@/modules/booking/display';
import {
  bookingEventsQuery,
  bookingKey,
  bookingQuery,
  driverLinkQuery,
} from '@/modules/booking/queries';
import { BookingTimeline } from '@/modules/booking/timeline';

// BK-03, AV-02, CR-06, YD-08: the booking page staff reach from the plan board's "Open" and from
// the gate and dock rows. A stable route for U9: /t/$orgId/bookings/$bookingId.

export const Route = createFileRoute('/t/$orgId/bookings/$bookingId')({
  beforeLoad: guard({ permission: Permission.booking.view }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(bookingQuery(params.orgId, params.bookingId)),
  component: BookingPage,
});

function BookingPage() {
  const { t } = useTranslation('booking');
  const { orgId, bookingId } = Route.useParams();
  const booking = useSuspenseQuery(bookingQuery(orgId, bookingId)).data;
  const events = useQuery(bookingEventsQuery(orgId, bookingId));
  const access = useAccess();
  const change = useChangeAccess(booking.status);
  const dayLabel = useDayLabel();
  const siteTime = useSiteTime();
  const [dialog, setDialog] = useState<BookingDialog | null>(null);
  const day = siteDay(new Date(booking.startsAt), booking.timeZone as TimeZone);

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/t/$orgId/plan"
        params={{ orgId }}
        search={{ site: booking.siteId, date: day, booking: booking.id }}
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'w-fit' })}
      >
        <ArrowLeftIcon />
        {t(($) => $.plan.detail.back)}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-sm text-muted-foreground">{booking.code}</div>
          <h1 className="text-xl font-semibold tracking-tight">{booking.carrierName}</h1>
          <p className="text-sm text-muted-foreground">
            {booking.site.name} · {dayLabel(day)}{' '}
            <SiteTime {...siteTime(booking.startsAt, booking.timeZone)} />
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
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
            {flagsOf(booking).map((f) => (
              <BookingFlagBadge key={f} flag={f} />
            ))}
          </div>
        </div>
        {change.lock === ChangeLock.no_permission ? null : (
          <div className="flex max-w-sm flex-col items-end gap-1">
            <div className="flex gap-2">
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
                className="text-destructive"
                disabled={!change.canCancel}
                onClick={() => setDialog('cancel')}
              >
                <BanIcon />
                {t(($) => $.plan.actions.cancel)}
              </Button>
            </div>
            {change.lock ? <LockReason lock={change.lock} status={booking.status} /> : null}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <SlotCard booking={booking} />
          <AvisCard orgId={orgId} booking={booking} canEdit={change.canEditAvis} />
        </div>
        <div className="flex flex-col gap-4">
          {booking.safety.status === SafetyStatus.not_required ? null : (
            <SafetyCard booking={booking} />
          )}
          {access.can(Permission.booking.staff_book) && booking.driverLink.active ? (
            <DriverLinkCard orgId={orgId} booking={booking} />
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t(($) => $.plan.detail.timeline)}</CardTitle>
            </CardHeader>
            <CardContent>
              <BookingTimeline events={events.data} timeZone={booking.timeZone} />
            </CardContent>
          </Card>
        </div>
      </div>

      <RescheduleDialog
        orgId={orgId}
        booking={booking}
        open={dialog === BookingDialog.reschedule}
        onOpenChange={(open) => setDialog(open ? 'reschedule' : null)}
      />
      <CancelDialog
        orgId={orgId}
        booking={booking}
        open={dialog === BookingDialog.cancel}
        onOpenChange={(open) => setDialog(open ? 'cancel' : null)}
      />
    </div>
  );
}

function SlotCard({ booking }: { booking: BookingView }) {
  const { t } = useTranslation('booking');
  const siteTime = useSiteTime();
  const loadTypeName = useLoadTypeName();
  const zone = booking.timeZone;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(($) => $.plan.detail.slot)}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-muted-foreground">{t(($) => $.plan.detail.slot)}</dt>
          <dd data-testid="booking-slot">
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
          <dd data-testid="booking-load">
            {t(($) => $.plan.board.units, { n: booking.loadUnits })} ·{' '}
            {loadTypeName(booking.loadType.name)}
          </dd>
          <dt className="text-muted-foreground">{t(($) => $.plan.detail.booked_by)}</dt>
          <dd>{t(($) => $.plan.detail.party[booking.createdParty])}</dd>
          {booking.checkedInAt ? (
            <>
              <dt className="text-muted-foreground">{t(($) => $.lifecycle.status.checked_in)}</dt>
              <dd>
                <SiteTime {...siteTime(booking.checkedInAt, zone)} />
              </dd>
            </>
          ) : null}
          {booking.cancelReason ? (
            <>
              <dt className="text-muted-foreground">{t(($) => $.plan.cancel.reason)}</dt>
              <dd>{booking.cancelReason}</dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function AvisCard({
  orgId,
  booking,
  canEdit,
}: {
  orgId: string;
  booking: BookingView;
  canEdit: boolean;
}) {
  const { t } = useTranslation('booking');
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(($) => $.plan.sheet.avis)}</CardTitle>
        {canEdit && !editing ? (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon />
              {t(($) => $.plan.avis.edit)}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {editing ? (
          <AvisEditForm orgId={orgId} booking={booking} onDone={() => setEditing(false)} />
        ) : (
          <AvisSummary avis={booking.avis} direction={booking.direction} />
        )}
      </CardContent>
    </Card>
  );
}

function AvisEditForm({
  orgId,
  booking,
  onDone,
}: {
  orgId: string;
  booking: BookingView;
  onDone: () => void;
}) {
  const { t } = useTranslation('booking');
  const { t: tCore } = useTranslation('core');
  const queryClient = useQueryClient();
  const rules = useAvisRules(booking.siteId);
  const [conflict, setConflict] = useState<ApiFailure | null>(null);
  const form = useForm<AvisFormValues, unknown, Avis>({
    resolver: avisResolver,
    defaultValues: avisFormValues(booking.avis),
  });
  const save = useMutation({
    mutationFn: (body: PutAvis) =>
      call<BookingView>(
        api.t[':orgId'].bookings[':bookingId'].avis.$put({
          param: { orgId, bookingId: booking.id },
          json: body,
        }),
      ),
    meta: { silent: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bookingKey(orgId) });
      toast.success(t(($) => $.plan.avis.saved));
      onDone();
    },
    onError: (e) => {
      if (applyAvisIssues(e, form)) return;
      if (e instanceof ApiFailure && e.code === ErrorCode.conflict) return setConflict(e);
      toast.error(e instanceof ApiFailure ? errorText(tCore, e) : String(e));
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((avis) => {
        setConflict(null);
        save.mutate({ avis, version: booking.version });
      })}
    >
      {conflict ? (
        <Alert variant="destructive">
          <AlertTitle>{errorText(tCore, conflict)}</AlertTitle>
          <AlertDescription>
            {conflict.conflictReason === ConflictReason.stale_version
              ? t(($) => $.plan.avis.stale)
              : t(($) => $.plan.avis.unchanged)}
          </AlertDescription>
        </Alert>
      ) : null}
      <AvisFields form={form} direction={booking.direction} rules={rules} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {t(($) => $.plan.avis.discard)}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          {t(($) => $.plan.avis.save)}
        </Button>
      </div>
    </form>
  );
}

function SafetyCard({ booking }: { booking: BookingView }) {
  const { t } = useTranslation('booking');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(($) => $.plan.detail.safety)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {booking.safety.instructions.map((i) => (
          <div key={i.instructionId} className="flex flex-wrap items-center justify-between gap-2">
            <span>{i.name}</span>
            <BookingSafetyBadge status={i.status} size={BadgeSize.sm} />
          </div>
        ))}
        {booking.safety.enforced ? (
          <p className="text-xs text-muted-foreground">{t(($) => $.plan.detail.safety_enforced)}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DriverLinkCard({ orgId, booking }: { orgId: string; booking: BookingView }) {
  const { t } = useTranslation('booking');
  const queryClient = useQueryClient();
  const link = useQuery(driverLinkQuery(orgId, booking.id));
  const dayLabel = useDayLabel();
  const regenerate = useMutation({
    mutationFn: () =>
      call<DriverLinkView>(
        api.t[':orgId'].bookings[':bookingId']['driver-link'].$post({
          param: { orgId, bookingId: booking.id },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bookingKey(orgId) });
      toast.success(t(($) => $.plan.driver_link.regenerated));
    },
  });
  const copy = async () => {
    if (!link.data) return;
    await navigator.clipboard.writeText(link.data.url);
    toast.success(t(($) => $.plan.driver_link.copied));
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(($) => $.plan.driver_link.title)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {link.data ? (
          <p className="text-muted-foreground">
            {t(($) => $.plan.driver_link.expires, {
              day: dayLabel(siteDay(new Date(link.data.expiresAt), booking.timeZone as TimeZone)),
            })}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!link.data} onClick={() => void copy()}>
            <CopyIcon />
            {t(($) => $.plan.driver_link.copy)}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate()}
          >
            {regenerate.isPending ? <Spinner /> : <RefreshCwIcon />}
            {t(($) => $.lifecycle.command.regenerate_driver_link)}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
