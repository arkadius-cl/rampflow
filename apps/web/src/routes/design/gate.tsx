import { BookingStatus, Punctuality } from '@rampflow/shared/modules/booking/values';
import { BriefingState } from '@rampflow/shared/modules/safety/values';
import { UiSize } from '@rampflow/shared/values';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  LogInIcon,
  OctagonXIcon,
  PlayIcon,
  ScanLineIcon,
  SearchIcon,
  TruckIcon,
  UserSearchIcon,
} from 'lucide-react';
import { TabletShell } from '@/components/shells/tablet-shell';
import { SiteTime, SiteTimeRange } from '@/components/site-time';
import { BookingStatusBadge, PunctualityBadge, SafetyBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Booking } from '@/lib/domain';
import { cn } from '@/lib/utils';
import { bookings, NOW, sites } from './-mock';

export const Route = createFileRoute('/design/gate')({
  validateSearch: (search: Record<string, unknown>): { checkin?: string } => ({
    checkin: typeof search.checkin === 'string' ? search.checkin : undefined,
  }),
  component: GateScreen,
});

const site = sites[0];
const ON_SITE = new Set(['checked_in', 'called', 'at_dock', 'loading', 'done']);

function GateScreen() {
  const { checkin } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const expected = bookings.filter(
    (b) => b.status === BookingStatus.confirmed || b.status === BookingStatus.no_show,
  );
  const onSite = bookings.filter((b) => ON_SITE.has(b.status));
  const dialogBooking = bookings.find((b) => b.id === checkin);
  if (!site) return null;

  return (
    <TabletShell
      station="Gate"
      stationIcon={ScanLineIcon}
      siteName={site.name}
      clock={NOW}
      zone={site.zoneLabel}
      operator="M. Weber"
      toolbar={
        <>
          <InputGroup className="max-w-xl flex-1 text-base">
            <InputGroupAddon>
              <ScanLineIcon className="size-5" />
            </InputGroupAddon>
            <InputGroupInput
              autoFocus
              placeholder="Scan QR or type code, plate, reference, carrier"
              className="text-base"
              aria-label="Find booking"
            />
            <InputGroupAddon align="inline-end">
              <SearchIcon className="size-5" />
            </InputGroupAddon>
          </InputGroup>
          <Tabs defaultValue="expected" className="ml-auto">
            <TabsList>
              <TabsTrigger value="expected" className="px-4">
                Expected <span className="ml-1 text-muted-foreground">{expected.length}</span>
              </TabsTrigger>
              <TabsTrigger value="onsite" className="px-4">
                On site <span className="ml-1 text-muted-foreground">{onSite.length}</span>
              </TabsTrigger>
              <TabsTrigger value="departed" className="px-4">
                Departed <span className="ml-1 text-muted-foreground">1</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline">
            <TruckIcon /> Walk-in
          </Button>
        </>
      }
    >
      <ul className="flex flex-col gap-2" aria-label="Expected trucks today">
        {expected
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((b) => (
            <ExpectedRow key={b.id} booking={b} />
          ))}
      </ul>

      <Dialog
        open={dialogBooking !== undefined}
        onOpenChange={(open) => {
          if (!open) navigate({ search: {} });
        }}
      >
        {dialogBooking ? <CheckInDialog booking={dialogBooking} /> : null}
      </Dialog>
    </TabletShell>
  );
}

function ExpectedRow({ booking: b }: { booking: Booking }) {
  const late = b.status === BookingStatus.confirmed && b.start < NOW;
  const blocked = b.safety !== BriefingState.valid;
  return (
    <li
      className={cn(
        'grid grid-cols-[7rem_minmax(0,1fr)_11rem_12rem_auto] items-center gap-4 rounded-lg border bg-background px-4 py-3',
        b.status === BookingStatus.no_show && 'opacity-70',
      )}
    >
      <div>
        <SiteTimeRange
          start={b.start}
          end={b.end}
          zone={site?.zoneLabel ?? ''}
          className="text-lg font-semibold"
        />
        {late ? (
          <PunctualityBadge
            punctuality={Punctuality.late}
            minutes={12}
            size={UiSize.sm}
            className="mt-1"
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="truncate text-lg font-semibold">{b.carrier}</div>
        <div className="truncate text-muted-foreground">
          {b.plate ? <span className="font-mono">{b.plate}</span> : 'no plate'} · {b.loadUnits} ·{' '}
          {b.loadType} · <span className="font-mono">{b.code}</span>
        </div>
      </div>
      <SafetyBadge status={b.safety} size={UiSize.lg} />
      <BookingStatusBadge status={b.status} size={UiSize.lg} />
      <div className="flex gap-2">
        <Button
          className="min-w-36"
          nativeButton={false}
          render={<Link to="/design/gate" search={{ checkin: b.id }} />}
          variant={blocked ? 'outline' : 'default'}
        >
          <LogInIcon /> Check in
        </Button>
      </div>
    </li>
  );
}

function CheckInDialog({ booking: b }: { booking: Booking }) {
  const blocked = b.safety !== BriefingState.valid;
  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="text-xl">Check in {b.carrier}</DialogTitle>
        <DialogDescription>
          Slot <SiteTimeRange start={b.start} end={b.end} zone={site?.zoneLabel ?? ''} /> ·{' '}
          {b.loadUnits} · {b.loadType} · <span className="font-mono">{b.code}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="plate-seen">Plate as seen</FieldLabel>
          <Input id="plate-seen" defaultValue={b.plate} className="font-mono text-lg uppercase" />
        </Field>
        <div>
          <div className="text-sm font-medium">Arrival</div>
          <div className="mt-2 flex items-center gap-2">
            <SiteTime time={NOW} zone={site?.zoneLabel ?? ''} className="text-lg font-semibold" />
            <PunctualityBadge punctuality={Punctuality.early} minutes={12} size={UiSize.lg} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Within 30 min early tolerance.</p>
        </div>
      </div>

      <section
        className={cn(
          'rounded-lg border p-4',
          blocked
            ? 'border-tone-danger-border bg-tone-danger-bg/50'
            : 'border-tone-success-border bg-tone-success-bg/50',
        )}
        aria-labelledby="safety-heading"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 id="safety-heading" className="font-semibold">
            Safety briefing
          </h3>
          <SafetyBadge status={b.safety} size={UiSize.lg} />
        </div>
        {blocked ? (
          <>
            <p className="mt-1 text-sm">
              This site requires a valid briefing before check-in. Link one the driver already did,
              or run it on this device.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button variant="outline" className="justify-start">
                <UserSearchIcon /> Find by driver name
              </Button>
              <Button variant="outline" className="justify-start">
                <PlayIcon /> Start briefing here (3 min)
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm">
            Acknowledged on 2 Mar 2026 in Polish, valid until 2 Mar 2027.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <Field className="w-64">
          <FieldLabel htmlFor="turn-reason">Turn away instead</FieldLabel>
          <NativeSelect id="turn-reason">
            <NativeSelectOption value="">Choose a reason…</NativeSelectOption>
            <NativeSelectOption value="safety_not_completed">
              Safety briefing not completed
            </NativeSelectOption>
            <NativeSelectOption value="no_capacity">No capacity</NativeSelectOption>
            <NativeSelectOption value="too_late">Too late</NativeSelectOption>
            <NativeSelectOption value="documents_missing">Documents missing</NativeSelectOption>
            <NativeSelectOption value="wrong_load">Wrong load</NativeSelectOption>
            <NativeSelectOption value="damaged">Damaged</NativeSelectOption>
            <NativeSelectOption value="other">Other</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Button variant="destructive" disabled>
          <OctagonXIcon /> Turn away
        </Button>
      </div>

      <DialogFooter className="items-center">
        {blocked ? (
          <span className="mr-auto text-sm text-tone-danger">
            Check-in is disabled until a valid briefing is linked.
          </span>
        ) : null}
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link to="/design/gate" search={{}} />}
        >
          Cancel
        </Button>
        <Button size="lg" className="min-w-44" disabled={blocked}>
          <LogInIcon /> Check in now
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
