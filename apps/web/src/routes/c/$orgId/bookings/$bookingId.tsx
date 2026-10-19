import type { Avis } from '@rampflow/shared/modules/avis/avis';
import type { PortalBookingView } from '@rampflow/shared/modules/booking/api.portal';
import type { PutAvis } from '@rampflow/shared/modules/booking/api.staff';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  BanIcon,
  CalendarClockIcon,
  PencilIcon,
  PhoneIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorText } from '@/components/app-shell/form-errors';
import { RouteError, RouteNotFound } from '@/components/app-shell/route-states';
import { SiteTime } from '@/components/site-time';
import { TenantLogo } from '@/components/tenant-logo';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { carrierContextQuery, guard, useAccess } from '@/lib/access';
import { ApiFailure, api, call, isFailure } from '@/lib/api';
import { useSiteTime } from '@/lib/time';
import {
  AvisFields,
  type AvisFormValues,
  applyAvisIssues,
  avisFormValues,
  avisResolver,
} from '@/modules/booking/avis-form';
import { AvisSummary } from '@/modules/booking/avis-summary';
import { BookingSafetyBadge, BookingStatusBadge, useLoadTypeName } from '@/modules/booking/display';
import { BookingTimeline } from '@/modules/booking/timeline';
import { CancelDialog, RescheduleDialog } from '@/modules/portal/actions';
import {
  AddressLines,
  beforeCutoff,
  CodeQr,
  CutoffNote,
  SlotText,
} from '@/modules/portal/booking-parts';
import { DriverLinkCard } from '@/modules/portal/driver-link';
import { portalBookingQuery, portalKey, portalSitesQuery } from '@/modules/portal/queries';

// CR-05, BK-05, CR-06, AV-02: one booking of the carrier with the visit from gate-in to gate-out,
// change and cancel until the cutoff (then the site phone), the avis and the driver link.
// Another carrier's booking answers 404 and shows "not found".

export const Route = createFileRoute('/c/$orgId/bookings/$bookingId')({
  beforeLoad: guard({ permission: 'booking.view' }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(portalBookingQuery(params.orgId, params.bookingId)),
  errorComponent: (props) =>
    isFailure(props.error, 'not_found') ? <RouteNotFound /> : <RouteError {...props} />,
  component: BookingPage,
});

function BookingPage() {
  const { t } = useTranslation('booking');
  const { orgId, bookingId } = Route.useParams();
  const booking = useSuspenseQuery(portalBookingQuery(orgId, bookingId)).data;
  const logoUrl = useQuery(carrierContextQuery(orgId)).data?.tenants.find(
    (x) => x.id === booking.tenant.id,
  )?.logoUrl;
  const access = useAccess();
  const canBook = access.can('booking.book');
  const loadTypeName = useLoadTypeName();
  const [dialog, setDialog] = useState<'reschedule' | 'cancel' | null>(null);
  const changeable = canBook && beforeCutoff(booking);
  const lockReason =
    booking.status !== 'confirmed'
      ? t(($) => $.portal.detail.locked_status, {
          status: t(($) => $.lifecycle.status[booking.status]),
        })
      : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/c/$orgId/bookings"
        params={{ orgId }}
        search={{ tab: 'upcoming' }}
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'w-fit' })}
      >
        <ArrowLeftIcon /> {t(($) => $.portal.detail.back)}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <TenantLogo url={logoUrl} className="mb-2" />
          <div className="font-mono text-sm text-muted-foreground">{booking.code}</div>
          <h1 className="text-xl font-semibold tracking-tight">
            {booking.tenant.name} · {booking.site.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            <SlotText
              startsAt={booking.startsAt}
              endsAt={booking.endsAt}
              timeZone={booking.timeZone}
            />
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <BookingStatusBadge status={booking.status} />
            {booking.safety === 'not_required' ? null : (
              <BookingSafetyBadge status={booking.safety} />
            )}
          </div>
        </div>
        {canBook ? (
          <div className="flex max-w-sm flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!changeable || !booking.linkActive}
                onClick={() => setDialog('reschedule')}
              >
                <CalendarClockIcon /> {t(($) => $.portal.actions.reschedule)}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                disabled={!changeable}
                onClick={() => setDialog('cancel')}
              >
                <BanIcon /> {t(($) => $.portal.actions.cancel)}
              </Button>
              {booking.linkActive ? (
                <Link
                  to="/c/$orgId/book"
                  params={{ orgId }}
                  search={{ step: 'when', from: booking.id }}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  <RefreshCwIcon /> {t(($) => $.portal.actions.book_again)}
                </Link>
              ) : null}
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {lockReason ?? <CutoffNote booking={booking} />}
            </p>
            {!booking.linkActive ? (
              <p className="text-right text-xs text-muted-foreground">
                {t(($) => $.portal.detail.link_inactive)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t(($) => $.portal.detail.where)}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t(($) => $.portal.summary.site)}</dt>
                <dd>
                  {booking.site.name}
                  <div className="text-muted-foreground">
                    <AddressLines address={booking.site.address} />
                  </div>
                </dd>
                <dt className="text-muted-foreground">{t(($) => $.portal.detail.phone)}</dt>
                <dd>
                  {booking.site.phone ? (
                    <a
                      href={`tel:${booking.site.phone}`}
                      className="inline-flex items-center gap-1 underline underline-offset-2"
                    >
                      <PhoneIcon className="size-3.5" aria-hidden /> {booking.site.phone}
                    </a>
                  ) : (
                    '–'
                  )}
                </dd>
                <dt className="text-muted-foreground">{t(($) => $.portal.summary.load)}</dt>
                <dd>
                  {booking.loadUnits} · {loadTypeName(booking.loadType.name)} ·{' '}
                  {t(($) => $.portal.direction[booking.direction])}
                </dd>
                {booking.dockCode ? (
                  <>
                    <dt className="text-muted-foreground">{t(($) => $.portal.detail.dock)}</dt>
                    <dd className="font-medium">{booking.dockCode}</dd>
                  </>
                ) : null}
                {booking.cancelReason ? (
                  <>
                    <dt className="text-muted-foreground">
                      {t(($) => $.portal.detail.cancel_reason)}
                    </dt>
                    <dd>{booking.cancelReason}</dd>
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          <AvisCard orgId={orgId} booking={booking} canEdit={changeable && booking.linkActive} />
          <VisitCard booking={booking} />
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t(($) => $.portal.detail.code)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-2">
              <CodeQr value={booking.code} label={t(($) => $.portal.qr, { code: booking.code })} />
              <div className="font-mono text-xl font-semibold tracking-wide">{booking.code}</div>
              <p className="text-center text-xs text-muted-foreground">
                {t(($) => $.portal.detail.code_hint)}
              </p>
            </CardContent>
          </Card>
          {canBook && booking.linkActive ? (
            <DriverLinkCard orgId={orgId} booking={booking} />
          ) : null}
        </div>
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
    </div>
  );
}

/** CR-05: the visit from gate-in to gate-out, then every event without actors. */
function VisitCard({ booking }: { booking: PortalBookingView }) {
  const { t } = useTranslation('booking');
  const siteTime = useSiteTime();
  const steps: [string, string | null][] = [
    [t(($) => $.portal.visit.checked_in), booking.checkedInAt],
    [t(($) => $.portal.visit.at_dock), booking.atDockAt],
    [t(($) => $.portal.visit.done), booking.doneAt],
    [t(($) => $.portal.visit.departed), booking.departedAt],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(($) => $.portal.visit.title)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {steps.map(([label, at]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium">
                {at ? <SiteTime {...siteTime(at, booking.timeZone)} /> : '–'}
              </dd>
            </div>
          ))}
        </dl>
        <BookingTimeline events={booking.events} timeZone={booking.timeZone} />
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
  booking: PortalBookingView;
  canEdit: boolean;
}) {
  const { t } = useTranslation('booking');
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(($) => $.portal.detail.avis)}</CardTitle>
        {canEdit && !editing ? (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon /> {t(($) => $.portal.actions.edit_avis)}
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
  booking: PortalBookingView;
  onDone: () => void;
}) {
  const { t } = useTranslation('booking');
  const { t: tCore } = useTranslation('core');
  const queryClient = useQueryClient();
  const sites = useQuery(portalSitesQuery(orgId, booking.tenant.id));
  const rules = sites.data?.find((s) => s.id === booking.site.id)?.avisRules;
  const [conflict, setConflict] = useState<ApiFailure | null>(null);
  const form = useForm<AvisFormValues, unknown, Avis>({
    resolver: avisResolver,
    defaultValues: avisFormValues(booking.avis),
  });
  const save = useMutation({
    mutationFn: (body: PutAvis) =>
      call<PortalBookingView>(
        api.c[':orgId'].at[':tenantId'].bookings[':bookingId'].avis.$put({
          param: { orgId, tenantId: booking.tenant.id, bookingId: booking.id },
          json: body,
        }),
      ),
    meta: { silent: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: portalKey(orgId) });
      toast.success(t(($) => $.portal.detail.avis_saved));
      onDone();
    },
    onError: (e) => {
      if (applyAvisIssues(e, form)) return;
      if (e instanceof ApiFailure && e.code === 'conflict') return setConflict(e);
      toast.error(e instanceof ApiFailure ? errorText(tCore, e) : String(e));
    },
  });
  if (!rules) return <Skeleton className="h-48 w-full" />;
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
          <AlertDescription>{t(($) => $.portal.detail.avis_unchanged)}</AlertDescription>
        </Alert>
      ) : null}
      <AvisFields form={form} direction={booking.direction} rules={rules} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {t(($) => $.portal.actions.discard)}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          {t(($) => $.portal.actions.save)}
        </Button>
      </div>
    </form>
  );
}
