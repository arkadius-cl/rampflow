import { BookingStatus, ResourceKind } from '@rampflow/shared/modules/booking/values';
import { DockStatus, TemperatureZone } from '@rampflow/shared/modules/core/values';
import { BadgeSize } from '@rampflow/shared/values';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  BellRingIcon,
  CircleCheckIcon,
  DoorOpenIcon,
  PackageOpenIcon,
  PhoneIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from 'lucide-react';
import { useState } from 'react';
import { TabletShell } from '@/components/shells/tablet-shell';
import { SiteTime, SiteTimeRange } from '@/components/site-time';
import { BookingStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Booking, Dock } from '@/lib/domain';
import { cn } from '@/lib/utils';
import { bookings, docks, halls, NOW, resources, sites } from './-mock';

export const Route = createFileRoute('/design/dock')({
  validateSearch: (search: Record<string, unknown>): { call?: string } => ({
    call: typeof search.call === 'string' ? search.call : undefined,
  }),
  component: DockScreen,
});

const site = sites[0];
const OCCUPYING = new Set(['called', 'at_dock', 'loading']);

function occupant(dock: Dock): Booking | undefined {
  return bookings.find((b) => b.dockId === dock.id && OCCUPYING.has(b.status));
}

function minutesSince(hhmm: string): number {
  const [h1, m1] = NOW.split(':').map(Number);
  const [h2, m2] = hhmm.split(':').map(Number);
  return (h1 ?? 0) * 60 + (m1 ?? 0) - ((h2 ?? 0) * 60 + (m2 ?? 0));
}

function DockScreen() {
  const { call } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queue = bookings
    .filter((b) => b.status === BookingStatus.checked_in)
    .sort((a, b) => a.start.localeCompare(b.start));
  const calling = bookings.find((b) => b.id === call);
  if (!site) return null;

  return (
    <TabletShell
      station="Docks"
      stationIcon={DoorOpenIcon}
      siteName={site.name}
      clock={NOW}
      zone={site.zoneLabel}
      operator="T. Arslan"
    >
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-5">
          {halls.map((hall) => (
            <section key={hall.id} aria-labelledby={`hall-${hall.id}`}>
              <h2
                id={`hall-${hall.id}`}
                className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {hall.name}
              </h2>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                {docks
                  .filter((d) => d.hallId === hall.id && d.status !== DockStatus.inactive)
                  .map((d) => (
                    <DockCard key={d.id} dock={d} booking={occupant(d)} />
                  ))}
              </div>
            </section>
          ))}
        </div>

        <aside
          className="flex min-h-0 flex-col rounded-lg border bg-background"
          aria-labelledby="queue-heading"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 id="queue-heading" className="font-semibold">
              Waiting in the yard
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-sm font-medium tabular-nums">
              {queue.length}
            </span>
          </div>
          <ul className="flex flex-col divide-y overflow-y-auto">
            {queue.map((b) => {
              const checkedIn =
                b.timeline.find((t) => t.status === BookingStatus.checked_in)?.at ?? b.start;
              const waited = minutesSince(checkedIn);
              return (
                <li key={b.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{b.carrier}</div>
                      <div className="text-sm text-muted-foreground">
                        Slot <SiteTimeRange start={b.start} end={b.end} zone={site.zoneLabel} /> ·{' '}
                        {resources.find((r) => r.id === b.resourceId)?.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-mono">{b.plate}</span> · {b.loadUnits} units
                      </div>
                    </div>
                    <div
                      className={cn(
                        'shrink-0 text-right text-sm',
                        waited > 30 && 'text-tone-onsite',
                      )}
                    >
                      <div className="text-lg font-semibold tabular-nums">{waited} min</div>
                      waiting
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="h-12 w-full"
                    nativeButton={false}
                    render={<Link to="/design/dock" search={{ call: b.id }} />}
                  >
                    <BellRingIcon /> Call to dock
                  </Button>
                </li>
              );
            })}
            {queue.length === 0 ? (
              <li className="px-4 py-10 text-center text-muted-foreground">No trucks waiting.</li>
            ) : null}
          </ul>
        </aside>
      </div>

      <Dialog
        open={calling !== undefined}
        onOpenChange={(open) => {
          if (!open) navigate({ search: {} });
        }}
      >
        {calling ? <CallDialog booking={calling} /> : null}
      </Dialog>
    </TabletShell>
  );
}

function DockCard({ dock, booking }: { dock: Dock; booking?: Booking }) {
  const maintenance = dock.status === DockStatus.maintenance;
  const since = booking ? booking.timeline[booking.timeline.length - 1]?.at : undefined;
  return (
    <div
      className={cn(
        'flex min-h-40 flex-col rounded-lg border bg-background p-3',
        booking && 'border-tone-active-border',
        maintenance && 'border-dashed bg-muted/40',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold tabular-nums">{dock.code}</span>
        <span className="text-xs text-muted-foreground">
          {dock.temperatureZone === TemperatureZone.chilled
            ? 'Chilled'
            : dock.adr
              ? 'ADR'
              : 'Ambient'}
        </span>
      </div>
      {maintenance ? (
        <div className="mt-auto flex items-center gap-2 text-muted-foreground">
          <WrenchIcon className="size-4" /> Maintenance
        </div>
      ) : booking ? (
        <>
          <div className="mt-1 truncate font-semibold">{booking.carrier}</div>
          <div className="text-sm text-muted-foreground">
            <span className="font-mono">{booking.plate}</span> · {booking.loadUnits} units
          </div>
          <div className="mt-1 flex items-center gap-2">
            <BookingStatusBadge status={booking.status} size={BadgeSize.md} />
            {since ? (
              <span className="text-xs text-muted-foreground">
                since <SiteTime time={since} zone={site?.zoneLabel ?? ''} />
              </span>
            ) : null}
          </div>
          <div className="mt-auto flex gap-2 pt-3">
            <ProgressButton status={booking.status} />
            {booking.driverPhone ? (
              <Button
                variant="outline"
                size="lg"
                className="h-11 px-3"
                aria-label="Call driver"
                nativeButton={false}
                render={<a href={`tel:${booking.driverPhone}`} />}
              >
                <PhoneIcon />
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-auto text-lg font-medium text-tone-success">Free</div>
      )}
    </div>
  );
}

function ProgressButton({ status }: { status: Booking['status'] }) {
  if (status === BookingStatus.called)
    return (
      <Button size="lg" className="h-11 flex-1">
        <DoorOpenIcon /> At dock
      </Button>
    );
  if (status === BookingStatus.at_dock)
    return (
      <Button size="lg" className="h-11 flex-1">
        <PackageOpenIcon /> Loading
      </Button>
    );
  return (
    <Button size="lg" className="h-11 flex-1">
      <CircleCheckIcon /> Done
    </Button>
  );
}

function CallDialog({ booking: b }: { booking: Booking }) {
  const resource = resources.find((r) => r.id === b.resourceId);
  const [dockId, setDockId] = useState<string | undefined>(
    () =>
      docks.find(
        (d) => resource?.dockIds.includes(d.id) && d.status === DockStatus.active && !occupant(d),
      )?.id,
  );
  const chosen = docks.find((d) => d.id === dockId);
  const outsidePool =
    chosen !== undefined && resource !== undefined && !resource.dockIds.includes(chosen.id);
  return (
    <DialogContent className="sm:max-w-2xl" data-density="touch">
      <DialogHeader>
        <DialogTitle className="text-xl">Call {b.carrier} to a dock</DialogTitle>
        <DialogDescription>
          {resource?.kind === ResourceKind.pool
            ? `Pool booking on ${resource.name}. Free member docks are suggested.`
            : 'Single-dock booking.'}{' '}
          Plate <span className="font-mono">{b.plate}</span>.
        </DialogDescription>
      </DialogHeader>
      <fieldset className="grid grid-cols-4 gap-2">
        <legend className="sr-only">Dock</legend>
        {docks
          .filter((d) => d.status !== DockStatus.inactive)
          .map((d) => {
            const occ = occupant(d);
            const member = resource?.dockIds.includes(d.id) ?? false;
            const disabled = occ !== undefined || d.status === DockStatus.maintenance;
            const active = d.id === dockId;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => setDockId(d.id)}
                className={cn(
                  'flex h-20 flex-col items-center justify-center rounded-lg border text-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  active && 'border-primary bg-primary text-primary-foreground',
                  !active && member && !disabled && 'border-tone-success-border bg-tone-success-bg',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                {d.code}
                <span
                  className={cn(
                    'text-xs font-normal',
                    active ? 'text-primary-foreground/80' : 'text-muted-foreground',
                  )}
                >
                  {occ
                    ? occ.carrier.split(' ')[0]
                    : d.status === DockStatus.maintenance
                      ? 'maintenance'
                      : member
                        ? 'suggested'
                        : 'other'}
                </span>
              </button>
            );
          })}
      </fieldset>
      {outsidePool ? (
        <div className="flex items-center gap-2 rounded-md border border-tone-onsite-border bg-tone-onsite-bg px-3 py-2 text-sm text-tone-onsite">
          <TriangleAlertIcon className="size-4 shrink-0" /> {chosen?.code} is not in the pool{' '}
          {resource?.name}. The call still works.
        </div>
      ) : null}
      <DialogFooter className="items-center">
        {b.driverPhone ? (
          <Button
            variant="outline"
            size="lg"
            className="mr-auto h-12"
            nativeButton={false}
            render={<a href={`tel:${b.driverPhone}`} />}
          >
            <PhoneIcon /> {b.driverPhone}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="lg"
          nativeButton={false}
          render={<Link to="/design/dock" search={{}} />}
        >
          Cancel
        </Button>
        <Button size="lg" className="h-12 min-w-44" disabled={!chosen}>
          <BellRingIcon /> Call to {chosen?.code ?? 'dock'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
