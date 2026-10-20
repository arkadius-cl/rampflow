import { ResourceKind } from '@rampflow/shared/modules/booking/values';
import { DockStatus } from '@rampflow/shared/modules/core/values';
import { PrototypeScreen } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import {
  ChevronRightIcon,
  LayersIcon,
  MapPinIcon,
  PlusIcon,
  SquareIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from 'lucide-react';
import { OfficeShell, PageHeader } from '@/components/shells/office-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Dock } from '@/lib/domain';
import { cn } from '@/lib/utils';
import { docks, halls, resources, sites } from './-mock';
import { dispatcherUser, memberships, tenantMembership, tenantNav } from './-nav';

export const Route = createFileRoute('/design/master-data')({
  component: MasterDataScreen,
});

const dockStatusLabel: Record<Dock['status'], string> = {
  active: 'Active',
  maintenance: 'Maintenance',
  inactive: 'Inactive',
};
const doorLabel: Record<Dock['doorType'], string> = {
  dock_leveler: 'Dock leveler',
  ground_level: 'Ground level',
  side_loading: 'Side loading',
  yard_open: 'Open yard',
};

function resourceOf(dockId: string) {
  return resources.find((r) => r.dockIds.includes(dockId));
}

function MasterDataScreen() {
  const site = sites[0];
  const pool = resources[0];
  if (!site || !pool) return null;
  const counted = docks.filter((d) => d.status !== DockStatus.inactive).length;
  return (
    <OfficeShell
      org={tenantMembership}
      memberships={memberships}
      nav={tenantNav(PrototypeScreen.master_data)}
      breadcrumbs={['Administration', 'Sites and docks', site.name]}
      user={dispatcherUser}
    >
      <PageHeader
        title="Sites and docks"
        description="Sites hold halls, halls hold docks. Carriers book pools or single docks, never a pooled dock directly."
        actions={
          <Button variant="outline" size="sm">
            <PlusIcon /> New site
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)_22rem]">
        <nav aria-label="Sites" className="flex flex-col gap-2">
          {sites
            .filter((s) => s.tenantId === tenantMembership.id)
            .map((s) => (
              <a
                key={s.id}
                href="#site"
                aria-current={s.id === site.id ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted',
                  s.id === site.id && 'border-primary ring-1 ring-primary',
                )}
              >
                <MapPinIcon className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.timeZone}</div>
                </div>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </a>
            ))}
          <div className="mt-2 rounded-lg border bg-background p-3 text-xs">
            <div className="flex justify-between">
              <span className="font-medium">Sites</span>
              <span className="tabular-nums text-muted-foreground">2 of 5</span>
            </div>
            <Progress value={40} className="mt-1.5" aria-label="Sites used" />
            <div className="mt-3 flex justify-between">
              <span className="font-medium">Docks</span>
              <span className="tabular-nums text-muted-foreground">{counted} of 60</span>
            </div>
            <Progress value={(counted / 60) * 100} className="mt-1.5" aria-label="Docks used" />
            <p className="mt-2 text-muted-foreground">
              Active and maintenance docks count against the Pro limit.
            </p>
          </div>
        </nav>

        <div className="flex flex-col gap-4">
          {halls.map((hall) => (
            <Card key={hall.id}>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>{hall.name}</CardTitle>
                  <CardDescription>
                    {docks.filter((d) => d.hallId === hall.id).length} docks
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <PlusIcon /> Dock
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Code</TableHead>
                      <TableHead>Door</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead>ADR</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="pr-6">Booked as</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docks
                      .filter((d) => d.hallId === hall.id)
                      .map((d) => {
                        const r = resourceOf(d.id);
                        return (
                          <TableRow
                            key={d.id}
                            className={cn(
                              d.status === DockStatus.inactive && 'text-muted-foreground',
                            )}
                          >
                            <TableCell className="pl-6 font-semibold">{d.code}</TableCell>
                            <TableCell>{doorLabel[d.doorType]}</TableCell>
                            <TableCell className="capitalize">{d.temperatureZone}</TableCell>
                            <TableCell>{d.adr ? 'Yes' : '—'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="gap-1">
                                {d.status === DockStatus.maintenance ? <WrenchIcon /> : null}
                                {dockStatusLabel[d.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="pr-6">
                              {r ? (
                                <span className="inline-flex items-center gap-1">
                                  {r.kind === ResourceKind.pool ? (
                                    <LayersIcon className="size-3.5 text-muted-foreground" />
                                  ) : (
                                    <SquareIcon className="size-3.5 text-muted-foreground" />
                                  )}
                                  {r.name}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Not bookable</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayersIcon className="size-4" /> Pool: {pool.name}
            </CardTitle>
            <CardDescription>
              A pool books as one unit. The dock is assigned on arrival.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="pool-name">Name</FieldLabel>
                <Input id="pool-name" defaultValue={pool.name} />
              </Field>
              <FieldSet>
                <FieldLegend variant="label">Directions</FieldLegend>
                <ToggleGroup value={['inbound']} variant="outline" multiple aria-label="Directions">
                  <ToggleGroupItem value="inbound">Inbound</ToggleGroupItem>
                  <ToggleGroupItem value="outbound">Outbound</ToggleGroupItem>
                </ToggleGroup>
              </FieldSet>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="pool-cap">Parallel slots</FieldLabel>
                  <InputGroup>
                    <InputGroupInput id="pool-cap" type="number" defaultValue={pool.capacity} />
                    <InputGroupAddon align="inline-end">trucks</InputGroupAddon>
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="pool-daily">Daily cap</FieldLabel>
                  <InputGroup>
                    <InputGroupInput id="pool-daily" type="number" defaultValue={pool.dailyCap} />
                    <InputGroupAddon align="inline-end">/ day</InputGroupAddon>
                  </InputGroup>
                </Field>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-tone-onsite-border bg-tone-onsite-bg px-3 py-2 text-xs text-tone-onsite">
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                Lowering parallel slots never cancels bookings. 1 booking on Mon 19 Oct would show
                as over capacity.
              </div>
              <FieldSet>
                <FieldLegend variant="label">Member docks</FieldLegend>
                <FieldDescription>
                  A dock belongs to at most one pool or single resource.
                </FieldDescription>
                <div className="flex flex-col gap-1.5">
                  {docks
                    .filter((d) => d.status !== DockStatus.inactive)
                    .map((d) => {
                      const r = resourceOf(d.id);
                      const elsewhere = r !== undefined && r.id !== pool.id;
                      return (
                        <label
                          key={d.id}
                          htmlFor={`member-${d.id}`}
                          className={cn(
                            'flex items-center gap-2 text-sm',
                            elsewhere && 'text-muted-foreground',
                          )}
                        >
                          <Checkbox
                            id={`member-${d.id}`}
                            defaultChecked={r?.id === pool.id}
                            disabled={elsewhere}
                          />
                          <span className="font-medium">{d.code}</span>
                          <span className="text-xs text-muted-foreground">
                            {elsewhere ? `in ${r.name}` : doorLabel[d.doorType]}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </FieldSet>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm">
                  Discard
                </Button>
                <Button size="sm">Save pool</Button>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </OfficeShell>
  );
}
