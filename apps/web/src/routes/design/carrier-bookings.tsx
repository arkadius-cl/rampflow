import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CalendarIcon,
  ClockIcon,
  FilterIcon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
} from 'lucide-react';
import { OfficeShell, PageHeader } from '@/components/shells/office-shell';
import { SiteTimeRange } from '@/components/site-time';
import { BookingStatusBadge, SafetyBadge } from '@/components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Booking } from '@/lib/domain';
import { cn } from '@/lib/utils';
import { carrierBookings, sites, tenants } from './-mock';
import { carrierMembership, carrierNav, carrierUser, memberships } from './-nav';

export const Route = createFileRoute('/design/carrier-bookings')({
  component: CarrierBookingsScreen,
});

function CarrierBookingsScreen() {
  return (
    <OfficeShell
      org={carrierMembership}
      memberships={memberships}
      nav={carrierNav('bookings')}
      breadcrumbs={['Bookings']}
      user={carrierUser}
    >
      <PageHeader
        title="Bookings"
        description="All slots of Trans-Pol at every warehouse that invited you. Times are shown in each site's local time."
        actions={
          <Button
            nativeButton={false}
            render={<Link to="/design/booking-wizard" search={{ step: 'where' }} />}
          >
            <PlusIcon /> New booking
          </Button>
        }
      />

      <Alert>
        <ClockIcon />
        <AlertTitle>Registration at Müller Handel KG is pending approval</AlertTitle>
        <AlertDescription>
          You can book there as soon as their dispatcher approves your request from 18 Oct.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
        </Tabs>
        <InputGroup className="w-64">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput placeholder="Code, plate, reference" />
        </InputGroup>
        <NativeSelect aria-label="Warehouse" className="w-44">
          <NativeSelectOption value="">All warehouses</NativeSelectOption>
          {tenants.map((t) => (
            <NativeSelectOption key={t.id} value={t.id}>
              {t.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Status" className="w-36">
          <NativeSelectOption value="">Any status</NativeSelectOption>
          <NativeSelectOption value="confirmed">Confirmed</NativeSelectOption>
          <NativeSelectOption value="departed">Departed</NativeSelectOption>
        </NativeSelect>
        <Button variant="outline" size="sm">
          <CalendarIcon /> 19 Oct – 2 Nov
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <FilterIcon /> Clear
        </Button>
      </div>

      <div className="overflow-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date and slot</TableHead>
              <TableHead>Warehouse · site</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Load</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Briefing</TableHead>
              <TableHead>Gate in → out</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carrierBookings.map((b) => (
              <Row key={b.id} booking={b} />
            ))}
          </TableBody>
        </Table>
      </div>
    </OfficeShell>
  );
}

function Row({ booking: b }: { booking: Booking }) {
  const site = sites.find((s) => s.id === b.siteId);
  const tenant = tenants.find((t) => t.id === b.tenantId);
  const gateIn = b.timeline.find((t) => t.status === BookingStatus.checked_in)?.at;
  const gateOut = b.timeline.find((t) => t.status === BookingStatus.departed)?.at;
  const changeable = b.status === BookingStatus.confirmed;
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">Mon 19 Oct</div>
        <SiteTimeRange
          start={b.start}
          end={b.end}
          zone={site?.zoneLabel ?? 'CET'}
          className="text-muted-foreground"
        />
      </TableCell>
      <TableCell>
        <div className="font-medium">{tenant?.name ?? b.tenantId}</div>
        <div className="text-muted-foreground">{site?.name ?? 'Munich South'}</div>
      </TableCell>
      <TableCell className="font-mono text-xs">{b.code}</TableCell>
      <TableCell>
        {b.loadUnits} · {b.loadType}
        {b.plate ? <div className="font-mono text-xs text-muted-foreground">{b.plate}</div> : null}
      </TableCell>
      <TableCell>
        <BookingStatusBadge status={b.status} size="sm" />
      </TableCell>
      <TableCell>
        <SafetyBadge status={b.safety} size="sm" />
      </TableCell>
      <TableCell className="tabular-nums">
        <span className={cn(!gateIn && 'text-muted-foreground/60')}>{gateIn ?? '—'}</span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className={cn(!gateOut && 'text-muted-foreground/60')}>{gateOut ?? '—'}</span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="xs" aria-label="Share driver link">
            <Share2Icon /> Driver link
          </Button>
          <Button variant="outline" size="xs" disabled={!changeable}>
            {changeable ? 'Change' : 'Details'}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
