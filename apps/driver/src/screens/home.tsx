import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import type { DriverBookingView } from '@rampflow/shared/modules/driver/api';
import { DriverChannel } from '@rampflow/shared/modules/driver/values';
import { SafetyStatus } from '@rampflow/shared/modules/safety/values';
import {
  BellRingIcon,
  CircleCheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  HourglassIcon,
  InfoIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  VibrateIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Qr } from '@/components/qr';
import { SiteTime, SiteTimeRange } from '@/components/site-time';
import { BookingStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/i18n';
import type { HomeScreen } from '@/lib/session';
import { dateAt, dayAt, siteTimeLabel } from '@/lib/time';

// The home screens of the driver flow (UX concept, "Driver PWA"): booking, waiting, called,
// done, and the closed states. Each reads the polled view only.

type View = DriverBookingView;

export function Home({ screen, view }: { screen: HomeScreen; view: View }) {
  switch (screen) {
    case 'booking':
      return <BookingScreen view={view} />;
    case 'waiting':
      return <WaitingScreen view={view} />;
    case 'called':
      return <CalledScreen view={view} />;
    case 'done':
      return <DoneScreen view={view} />;
    case 'closed':
      return <ClosedScreen view={view} />;
  }
}

function BookingScreen({ view }: { view: View }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { booking, site } = view;
  return (
    <>
      <section className="rounded-xl border bg-card p-4">
        <h1 className="text-sm text-muted-foreground">{t(($) => $.app.booking.slot)}</h1>
        <div className="mt-1 text-3xl font-semibold">
          <SiteTimeRange start={booking.startsAt} end={booking.endsAt} zone={site.timeZone} />
        </div>
        <div className="mt-1 text-lg">{dayAt(booking.startsAt, site.timeZone, locale)}</div>
        <div className="mt-3 flex items-start gap-2 text-sm">
          <MapPinIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <div className="font-medium">{site.name}</div>
            <address className="text-muted-foreground not-italic">
              {site.addressLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </address>
            <a
              href={site.mapUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              {t(($) => $.app.booking.map)} <ExternalLinkIcon aria-hidden className="size-3.5" />
            </a>
          </div>
        </div>
      </section>

      <section className="flex items-center gap-4 rounded-xl border bg-card p-4">
        <Qr
          value={booking.code}
          label={t(($) => $.app.booking.qr, { code: booking.code })}
          className="border"
        />
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">
            {t(($) => $.app.booking.show_at_gate)}
          </div>
          <div
            data-testid="booking-code"
            {...{ elementtiming: 'booking-code' /* first render, e2e/driver/DR-01 */ }}
            className="font-mono text-2xl font-semibold tracking-wide"
          >
            {booking.code}
          </div>
          <BookingStatusBadge status={booking.status} className="mt-2" />
        </div>
      </section>

      <SafetyCard view={view} />
      <GateDeviceNote view={view} />
      <PrivacyNote view={view} />
    </>
  );
}

function SafetyCard({ view }: { view: View }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { safety, site } = view;
  if (safety.status === SafetyStatus.not_required) return null;
  if (safety.status === SafetyStatus.valid) {
    return (
      <div
        data-testid="safety-valid"
        className="flex items-center justify-center gap-2 rounded-lg bg-tone-success-bg px-3 py-2 text-sm text-tone-success"
      >
        <ShieldCheckIcon aria-hidden className="size-4 shrink-0" />
        {safety.validUntil
          ? t(($) => $.app.safety.valid_until, {
              date: dateAt(safety.validUntil, site.timeZone, locale),
            })
          : t(($) => $.app.safety.valid_visit)}
      </div>
    );
  }
  return (
    <section className="rounded-xl border border-tone-onsite-border bg-tone-onsite-bg p-4">
      <h2 className="flex items-center gap-2 font-semibold text-tone-onsite">
        <ShieldAlertIcon aria-hidden className="size-5" />
        {t(($) => $.app.safety.required_title)}
      </h2>
      <p className="mt-1 text-sm">{t(($) => $.app.safety.required_body)}</p>
    </section>
  );
}

function GateDeviceNote({ view }: { view: View }) {
  const { t } = useTranslation();
  if (view.channel !== DriverChannel.staff) return null;
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {t(($) => $.app.gate_device)}
    </p>
  );
}

function PrivacyNote({ view }: { view: View }) {
  const { t } = useTranslation();
  return (
    <p className="text-xs text-muted-foreground">
      {t(($) => $.app.privacy.note)}
      {view.privacyNoticeUrl ? (
        <>
          {' '}
          <a
            href={view.privacyNoticeUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-4"
          >
            {t(($) => $.app.privacy.link)}
          </a>
        </>
      ) : null}
    </p>
  );
}

function CallSite({ view }: { view: View }) {
  const { t } = useTranslation();
  if (!view.site.phone) return null;
  return (
    <Button
      variant="outline"
      size="lg"
      className="h-12 w-full"
      nativeButton={false}
      render={<a href={`tel:${view.site.phone}`} />}
    >
      <PhoneIcon aria-hidden /> {t(($) => $.app.call_site)}
    </Button>
  );
}

function WaitingScreen({ view }: { view: View }) {
  const { t } = useTranslation();
  const { booking, site } = view;
  const waited = booking.checkedInAt
    ? Math.max(0, Math.floor((Date.parse(view.asOf) - Date.parse(booking.checkedInAt)) / 60_000))
    : null;
  return (
    <>
      <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border bg-card p-6 text-center">
        <div className="flex size-24 items-center justify-center rounded-full bg-tone-onsite-bg text-tone-onsite">
          <HourglassIcon aria-hidden className="size-12" />
        </div>
        <h1 className="text-3xl font-semibold">{t(($) => $.app.waiting.title)}</h1>
        <p className="text-lg text-muted-foreground">{t(($) => $.app.waiting.body)}</p>
        <BookingStatusBadge status={booking.status} size="xl" />
        {booking.checkedInAt ? (
          <dl className="mt-2 grid w-full grid-cols-2 gap-3 text-left text-sm">
            <div className="rounded-lg bg-muted p-3">
              <dt className="text-muted-foreground">{t(($) => $.app.waiting.checked_in)}</dt>
              <dd className="text-lg font-semibold">
                <SiteTime at={booking.checkedInAt} zone={site.timeZone} />
              </dd>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <dt className="text-muted-foreground">{t(($) => $.app.waiting.waited)}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {t(($) => $.app.waiting.minutes, { minutes: waited })}
              </dd>
            </div>
          </dl>
        ) : null}
      </section>
      <SafetyCard view={view} />
      <GateDeviceNote view={view} />
      <CallSite view={view} />
    </>
  );
}

function CalledScreen({ view }: { view: View }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { booking, site, dock } = view;
  return (
    <>
      <section
        aria-live="assertive"
        className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-signal p-6 text-center text-signal-foreground"
      >
        <h1 className="flex items-center gap-2 text-lg font-semibold uppercase tracking-wide">
          <BellRingIcon aria-hidden className="size-6" /> {t(($) => $.app.called.go)}
        </h1>
        {dock ? (
          <>
            <div
              data-testid="dock-code"
              className="text-[96px] font-black leading-none tabular-nums tracking-tight"
            >
              {dock.code}
            </div>
            <p className="text-2xl font-semibold">
              {t(($) => $.app.called.instruction, { dock: dock.code, hall: dock.hall })}
            </p>
          </>
        ) : null}
        <BookingStatusBadge status={booking.status} />
        {booking.calledAt ? (
          <div className="mt-2 flex items-center gap-1.5 rounded-full bg-black/10 px-3 py-1 text-sm font-medium">
            <ClockIcon aria-hidden className="size-4" />
            {t(($) => $.app.called.called_at, {
              time: siteTimeLabel(booking.calledAt, site.timeZone, locale),
            })}
          </div>
        ) : null}
      </section>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <VibrateIcon aria-hidden className="size-4 shrink-0" />
        {t(($) => $.app.called.vibrated)}
      </p>
      <CallSite view={view} />
    </>
  );
}

function DoneScreen({ view }: { view: View }) {
  const { t } = useTranslation();
  return (
    <>
      <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border bg-card p-6 text-center">
        <div className="flex size-24 items-center justify-center rounded-full bg-tone-success-bg text-tone-success">
          <CircleCheckIcon aria-hidden className="size-12" />
        </div>
        <h1 className="text-3xl font-semibold">{t(($) => $.app.done.title)}</h1>
        <p className="text-lg text-muted-foreground">{t(($) => $.app.done.body)}</p>
      </section>
      <LinkExpiry view={view} />
    </>
  );
}

function ClosedScreen({ view }: { view: View }) {
  const { t } = useTranslation();
  const status = view.booking.status;
  const text =
    status === BookingStatus.cancelled
      ? t(($) => $.app.closed.cancelled)
      : status === BookingStatus.no_show
        ? t(($) => $.app.closed.no_show)
        : status === BookingStatus.turned_away
          ? t(($) => $.app.closed.turned_away)
          : t(($) => $.app.closed.departed);
  return (
    <>
      <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border bg-card p-6 text-center">
        <BookingStatusBadge status={status} size="xl" />
        <h1 className="text-xl font-semibold">{text}</h1>
      </section>
      {status === BookingStatus.departed ? <LinkExpiry view={view} /> : <CallSite view={view} />}
    </>
  );
}

function LinkExpiry({ view }: { view: View }) {
  const { t } = useTranslation();
  const locale = useLocale();
  return (
    <p className="text-center text-xs text-muted-foreground">
      {t(($) => $.app.link_expiry, {
        date: dateAt(view.linkExpiresAt, view.site.timeZone, locale),
      })}
    </p>
  );
}
