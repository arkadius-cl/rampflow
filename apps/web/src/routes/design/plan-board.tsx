import { BookingStatus, PlanView } from '@rampflow/shared/modules/booking/values';
import { BadgeSize, isValueOf, PrototypeScreen } from '@rampflow/shared/values';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  BanIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Columns3Icon,
  ListIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  TruckIcon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';
import { PlanBoard } from '@/components/plan-board/plan-board';
import { OfficeShell } from '@/components/shells/office-shell';
import { SiteTime, SiteTimeRange } from '@/components/site-time';
import {
  BOOKING_STATUS,
  BookingStatusBadge,
  SafetyBadge,
  StatusBadge,
} from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Booking } from '@/lib/domain';
import { bookings, NOW, resources, sites } from './-mock';
import { dispatcherUser, memberships, tenantMembership, tenantNav } from './-nav';

export const Route = createFileRoute('/design/plan-board')({
  validateSearch: (search: Record<string, unknown>): { view: PlanView } => ({
    view: search.view === PlanView.list ? PlanView.list : PlanView.board,
  }),
  component: PlanBoardScreen,
});

const site = sites[0];
const siteItems = sites
  .filter((s) => s.tenantId === tenantMembership.id)
  .map((s) => ({ value: s.id, label: s.name }));

function PlanBoardScreen() {
  const { view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [selected, setSelected] = useState<Booking | undefined>(bookings[3]);
  if (!site) return null;

  return (
    <OfficeShell
      org={tenantMembership}
      memberships={memberships}
      nav={tenantNav(PrototypeScreen.board)}
      breadcrumbs={['Operations', 'Plan board']}
      user={dispatcherUser}
      flush
      toolbar={
        <Select defaultValue={site.id} items={siteItems}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {siteItems.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
        <ButtonGroup>
          <Button variant="outline" size="sm" aria-label="Previous day">
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="sm">
            <CalendarIcon />
            Mon 19 Oct 2026
          </Button>
          <Button variant="outline" size="sm" aria-label="Next day">
            <ChevronRightIcon />
          </Button>
        </ButtonGroup>
        <Button variant="ghost" size="sm">
          Today
        </Button>
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
        <ToggleGroup
          value={[view]}
          onValueChange={(v) => {
            const next = v[0];
            if (isValueOf(PlanView, next)) navigate({ search: { view: next } });
          }}
          variant="outline"
          size="sm"
          aria-label="View"
        >
          <ToggleGroupItem value="board" aria-label="Board view">
            <Columns3Icon />
            Board
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <ListIcon />
            List
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="ml-auto flex items-center gap-2">
          <Legend />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
          <Button variant="outline" size="sm">
            <TruckIcon />
            Walk-in now
          </Button>
          <Button size="sm">
            <PlusIcon />
            New booking
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col p-4">
          {view === PlanView.board ? (
            <PlanBoard
              resources={resources}
              bookings={bookings}
              zone={site.zoneLabel}
              dayStart="06:00"
              dayEnd="17:00"
              gridMinutes={30}
              now={NOW}
              selectedId={selected?.id}
              onSelect={setSelected}
            />
          ) : (
            <BookingList selectedId={selected?.id} onSelect={setSelected} />
          )}
        </div>
        {selected ? (
          <DetailPanel booking={selected} onClose={() => setSelected(undefined)} />
        ) : null}
      </div>
    </OfficeShell>
  );
}

function Legend() {
  const shown = [
    BookingStatus.confirmed,
    BookingStatus.checked_in,
    BookingStatus.called,
    BookingStatus.loading,
    BookingStatus.done,
  ];
  return (
    <ul className="hidden items-center gap-1 xl:flex" aria-label="Status legend">
      {shown.map((s) => (
        <li key={s}>
          <BookingStatusBadge status={s} size={BadgeSize.sm} />
        </li>
      ))}
    </ul>
  );
}

function BookingList({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (b: Booking) => void;
}) {
  return (
    <div className="overflow-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Slot</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Carrier</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Load</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Safety</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...bookings]
            .sort((a, b) => a.start.localeCompare(b.start))
            .map((b) => (
              <TableRow
                key={b.id}
                data-state={b.id === selectedId ? 'selected' : undefined}
                className="cursor-pointer"
                onClick={() => onSelect(b)}
              >
                <TableCell>
                  <SiteTimeRange start={b.start} end={b.end} zone={site?.zoneLabel ?? ''} />
                </TableCell>
                <TableCell>{resources.find((r) => r.id === b.resourceId)?.name}</TableCell>
                <TableCell className="font-medium">{b.carrier}</TableCell>
                <TableCell className="font-mono text-xs">{b.code}</TableCell>
                <TableCell>
                  {b.loadUnits} · {b.loadType}
                </TableCell>
                <TableCell>
                  <BookingStatusBadge status={b.status} size={BadgeSize.sm} />
                </TableCell>
                <TableCell>
                  <SafetyBadge status={b.safety} size={BadgeSize.sm} />
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DetailPanel({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const resource = resources.find((r) => r.id === booking.resourceId);
  const beforeCheckIn = booking.status === BookingStatus.confirmed;
  return (
    <aside
      className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-background p-4"
      aria-label="Booking detail"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-muted-foreground">{booking.code}</div>
          <h2 className="truncate text-lg font-semibold">{booking.carrier}</h2>
          <div className="mt-1 flex flex-wrap gap-1">
            <BookingStatusBadge status={booking.status} />
            <SafetyBadge status={booking.safety} />
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <XIcon />
        </Button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Slot</dt>
        <dd>
          <SiteTimeRange start={booking.start} end={booking.end} zone={site?.zoneLabel ?? ''} />
        </dd>
        <dt className="text-muted-foreground">Resource</dt>
        <dd>
          {resource?.name}
          {booking.dockId ? ` · ${booking.dockId.replace('d-', '').toUpperCase()}` : ''}
        </dd>
        <dt className="text-muted-foreground">Load</dt>
        <dd>
          {booking.loadUnits} units · {booking.loadType}
        </dd>
        <dt className="text-muted-foreground">Plate</dt>
        <dd className="font-mono">{booking.plate ?? '—'}</dd>
        <dt className="text-muted-foreground">References</dt>
        <dd>{booking.references.join(', ')}</dd>
        <dt className="text-muted-foreground">Driver</dt>
        <dd>
          {booking.driverPhone ? (
            <a
              href={`tel:${booking.driverPhone}`}
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <PhoneIcon className="size-3.5" />
              {booking.driverPhone}
            </a>
          ) : (
            '—'
          )}
        </dd>
      </dl>

      {booking.overCapacity ? (
        <div className="rounded-md border border-tone-danger-border bg-tone-danger-bg p-2 text-sm text-tone-danger">
          Over capacity: the pool was reduced after this booking. Reschedule or force-keep with a
          reason.
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button variant="outline" size="sm" disabled={!beforeCheckIn}>
          <PencilIcon />
          Edit or reschedule
        </Button>
        <Button variant="outline" size="sm" disabled={!beforeCheckIn} className="text-destructive">
          <BanIcon />
          Cancel booking
        </Button>
        {!beforeCheckIn ? (
          <p className="text-xs text-muted-foreground">
            Changes are locked after check-in. Yard actions continue on the gate and dock screens.
          </p>
        ) : null}
      </div>

      <Separator />
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Timeline
        </h3>
        <ol className="flex flex-col gap-2">
          {booking.timeline.map((t) => (
            <li key={`${t.status}-${t.at}`} className="flex items-start gap-2 text-sm">
              <StatusBadge
                meta={BOOKING_STATUS[t.status]}
                size={BadgeSize.sm}
                className="mt-0.5 w-28 justify-start"
              />
              <div className="leading-tight">
                {t.at.includes(' ') ? (
                  <span className="tabular-nums">{t.at}</span>
                ) : (
                  <SiteTime time={t.at} zone={site?.zoneLabel ?? ''} />
                )}
                {t.actor ? <div className="text-xs text-muted-foreground">{t.actor}</div> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
