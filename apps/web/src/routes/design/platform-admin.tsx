import { createFileRoute } from '@tanstack/react-router';
import { CalendarIcon, PlusIcon, TrashIcon, TriangleAlertIcon } from 'lucide-react';
import { OfficeShell, PageHeader } from '@/components/shells/office-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { memberships, platformMembership, platformNav, platformUser } from './-nav';

export const Route = createFileRoute('/design/platform-admin')({
  component: PlatformAdminScreen,
});

interface Usage {
  id: string;
  name: string;
  pkg: 'start' | 'pro' | 'enterprise';
  sites: [number, number | null];
  docks: [number, number | null];
  users: [number, number | null];
  bookings: [number, number | null];
}

const usage: Usage[] = [
  {
    id: 'acme',
    name: 'Acme Logistics GmbH',
    pkg: 'pro',
    sites: [2, 5],
    docks: [8, 60],
    users: [31, 75],
    bookings: [10840, 10000],
  },
  {
    id: 'nordfrost',
    name: 'Nordfrost Lager AG',
    pkg: 'start',
    sites: [1, 1],
    docks: [6, 10],
    users: [7, 10],
    bookings: [412, 1500],
  },
  {
    id: 'mueller',
    name: 'Müller Handel KG',
    pkg: 'enterprise',
    sites: [9, null],
    docks: [140, null],
    users: [210, null],
    bookings: [38120, null],
  },
];

interface Override {
  key: string;
  packageValue: string;
  override: string;
  expires?: string;
  soft?: boolean;
}

const overrides: Override[] = [
  {
    key: 'booking.max_bookings_per_month',
    packageValue: '10 000',
    override: '12 000',
    expires: '2026-12-31',
    soft: true,
  },
  { key: 'core.max_internal_users', packageValue: '75', override: '90' },
  { key: 'safety.max_briefing_templates', packageValue: '20', override: '5' },
];

function PlatformAdminScreen() {
  const tenant = usage[0];
  if (!tenant) return null;
  return (
    <OfficeShell
      org={platformMembership}
      memberships={[platformMembership, ...memberships]}
      nav={platformNav('tenants')}
      breadcrumbs={['Tenants', tenant.name]}
      user={platformUser}
    >
      <PageHeader
        title="Tenants"
        description="Usage against package limits this month. Soft limits above 100 % are flagged and block nothing."
        actions={
          <Button size="sm">
            <PlusIcon /> Create tenant
          </Button>
        }
      />
      <div className="overflow-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead>Docks</TableHead>
              <TableHead>Internal users</TableHead>
              <TableHead>Bookings this month</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usage.map((u) => (
              <TableRow key={u.id} data-state={u.id === tenant.id ? 'selected' : undefined}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {u.pkg}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Meter value={u.sites} />
                </TableCell>
                <TableCell>
                  <Meter value={u.docks} />
                </TableCell>
                <TableCell>
                  <Meter value={u.users} />
                </TableCell>
                <TableCell>
                  <Meter value={u.bookings} soft />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>{tenant.name} · entitlement overrides</CardTitle>
              <CardDescription>
                An override beats the package in both directions, applies on the next request and
                lapses at its expiry.
              </CardDescription>
            </div>
            <NativeSelect aria-label="Package" defaultValue="pro" className="w-36">
              <NativeSelectOption value="start">Start</NativeSelectOption>
              <NativeSelectOption value="pro">Pro</NativeSelectOption>
              <NativeSelectOption value="enterprise">Enterprise</NativeSelectOption>
            </NativeSelect>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Key</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Override</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((o) => {
                  const lowers =
                    Number(o.override.replace(/\s/g, '')) <
                    Number(o.packageValue.replace(/\s/g, ''));
                  return (
                    <TableRow key={o.key}>
                      <TableCell className="pl-6 font-mono text-xs">{o.key}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {o.packageValue}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <span className="font-semibold">{o.override}</span>
                        <span className="ml-1 text-xs text-muted-foreground">
                          {lowers ? 'lower' : 'higher'}
                          {o.soft ? ' · soft' : ''}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {o.expires ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarIcon className="size-3.5 text-muted-foreground" /> {o.expires}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">never</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove override ${o.key}`}
                        >
                          <TrashIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add override</CardTitle>
            <CardDescription>Unknown and reserved keys are rejected.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="ov-key">Entitlement key</FieldLabel>
              <NativeSelect id="ov-key" defaultValue="safety.quiz">
                <NativeSelectOption value="safety.quiz">safety.quiz (feature)</NativeSelectOption>
                <NativeSelectOption value="safety.gate_enforcement">
                  safety.gate_enforcement (feature)
                </NativeSelectOption>
                <NativeSelectOption value="core.max_sites">
                  core.max_sites (limit)
                </NativeSelectOption>
                <NativeSelectOption value="core.max_docks">
                  core.max_docks (limit)
                </NativeSelectOption>
                <NativeSelectOption value="booking.max_bookings_per_month">
                  booking.max_bookings_per_month (soft limit)
                </NativeSelectOption>
              </NativeSelect>
              <FieldDescription>
                Reserved keys such as integration.api do not appear.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ov-value">Value</FieldLabel>
              <NativeSelect id="ov-value" defaultValue="true">
                <NativeSelectOption value="true">On</NativeSelectOption>
                <NativeSelectOption value="false">Off</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="ov-exp">Expires</FieldLabel>
              <Input id="ov-exp" type="date" defaultValue="2026-11-30" />
              <FieldDescription>
                Leave empty for a permanent override. Trials usually end after 30 days.
              </FieldDescription>
            </Field>
            <Button>
              <PlusIcon /> Add override
            </Button>
          </CardContent>
        </Card>
      </div>
    </OfficeShell>
  );
}

function Meter({ value: [used, limit], soft }: { value: [number, number | null]; soft?: boolean }) {
  if (limit === null) {
    return (
      <span className="tabular-nums">
        {used.toLocaleString('en-GB')} <span className="text-muted-foreground">/ unlimited</span>
      </span>
    );
  }
  const pct = Math.round((used / limit) * 100);
  const over = pct > 100;
  return (
    <div className="flex min-w-36 flex-col gap-1">
      <div className="flex items-center justify-between text-xs tabular-nums">
        <span>
          {used.toLocaleString('en-GB')}{' '}
          <span className="text-muted-foreground">/ {limit.toLocaleString('en-GB')}</span>
        </span>
        <span
          className={cn(
            'flex items-center gap-1',
            over
              ? 'font-semibold text-tone-danger'
              : pct >= 90
                ? 'text-tone-onsite'
                : 'text-muted-foreground',
          )}
        >
          {over ? <TriangleAlertIcon className="size-3" /> : null}
          {pct} %{over && soft ? ' soft' : ''}
        </span>
      </div>
      <Progress value={Math.min(pct, 100)} aria-label={`${pct} percent used`} />
    </div>
  );
}
