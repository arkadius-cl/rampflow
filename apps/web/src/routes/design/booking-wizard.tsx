import {
  BookingStatus,
  PrototypeWizardStep,
  SlotAvailability,
} from '@rampflow/shared/modules/booking/values';
import { BadgeSize, PrototypeScreen, StepState } from '@rampflow/shared/values';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  CalendarPlusIcon,
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  MailIcon,
  MapPinIcon,
  RefreshCwIcon,
  Share2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { QrPlaceholder } from '@/components/qr-placeholder';
import { OfficeShell } from '@/components/shells/office-shell';
import { SiteTimeRange } from '@/components/site-time';
import { type SlotDay, type SlotOption, SlotPicker } from '@/components/slot-picker';
import { BookingStatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { sites } from './-mock';
import { carrierMembership, carrierNav, carrierUser, memberships } from './-nav';

type Step = PrototypeWizardStep;
const STEPS: { id: Step; title: string; hint: string }[] = [
  { id: PrototypeWizardStep.where, title: 'Where and what', hint: 'Warehouse, site, load type' },
  { id: PrototypeWizardStep.slot, title: 'When', hint: 'Day and start time' },
  { id: PrototypeWizardStep.avis, title: 'Avis', hint: 'Truck, driver, references' },
  { id: PrototypeWizardStep.confirmed, title: 'Confirmed', hint: 'Code, QR, driver link' },
];

export const Route = createFileRoute('/design/booking-wizard')({
  validateSearch: (search: Record<string, unknown>): { step: Step } => {
    const s = search.step;
    return { step: STEPS.some((x) => x.id === s) ? (s as Step) : PrototypeWizardStep.where };
  },
  component: BookingWizardScreen,
});

const site = sites[0];

const days: SlotDay[] = [
  { date: '2026-10-19', weekday: 'Mon', dayOfMonth: '19', freeCount: 0, closedReason: 'Lead time' },
  { date: '2026-10-20', weekday: 'Tue', dayOfMonth: '20', freeCount: 9 },
  { date: '2026-10-21', weekday: 'Wed', dayOfMonth: '21', freeCount: 14 },
  { date: '2026-10-22', weekday: 'Thu', dayOfMonth: '22', freeCount: 3 },
  { date: '2026-10-23', weekday: 'Fri', dayOfMonth: '23', freeCount: 17 },
  { date: '2026-10-24', weekday: 'Sat', dayOfMonth: '24', freeCount: 0, closedReason: 'Closed' },
  { date: '2026-10-25', weekday: 'Sun', dayOfMonth: '25', freeCount: 0, closedReason: 'Closed' },
];

const slots: SlotOption[] = [
  { time: '06:00', state: SlotAvailability.full, free: 0 },
  { time: '06:30', state: SlotAvailability.free, free: 2 },
  { time: '07:00', state: SlotAvailability.free, free: 2 },
  { time: '07:30', state: SlotAvailability.scarce, free: 1 },
  { time: '08:00', state: SlotAvailability.full, free: 0 },
  { time: '08:30', state: SlotAvailability.full, free: 0 },
  { time: '09:00', state: SlotAvailability.scarce, free: 1 },
  { time: '09:30', state: SlotAvailability.free, free: 2 },
  { time: '10:00', state: SlotAvailability.free, free: 2 },
  { time: '10:30', state: SlotAvailability.free, free: 2 },
  { time: '11:00', state: SlotAvailability.scarce, free: 1 },
  { time: '11:30', state: SlotAvailability.full, free: 0 },
  { time: '12:30', state: SlotAvailability.free, free: 2 },
  { time: '13:00', state: SlotAvailability.free, free: 2 },
  { time: '13:30', state: SlotAvailability.free, free: 2 },
  { time: '14:00', state: SlotAvailability.scarce, free: 1 },
  { time: '14:30', state: SlotAvailability.free, free: 2 },
  { time: '15:00', state: SlotAvailability.free, free: 2 },
];

function BookingWizardScreen() {
  const { step } = Route.useSearch();
  const index = STEPS.findIndex((s) => s.id === step);
  return (
    <OfficeShell
      org={carrierMembership}
      memberships={memberships}
      nav={carrierNav(PrototypeScreen.wizard)}
      breadcrumbs={['New booking', STEPS[index]?.title ?? '']}
      user={carrierUser}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_17rem]">
        <Stepper index={index} />
        <div className="min-w-0">
          {step === PrototypeWizardStep.where ? <WhereStep /> : null}
          {step === PrototypeWizardStep.slot ? <SlotStep /> : null}
          {step === PrototypeWizardStep.avis ? <AvisStep /> : null}
          {step === PrototypeWizardStep.confirmed ? <ConfirmedStep /> : null}
        </div>
        {step === PrototypeWizardStep.confirmed ? <div /> : <Summary step={step} />}
      </div>
    </OfficeShell>
  );
}

function Stepper({ index }: { index: number }) {
  return (
    <ol className="flex gap-2 lg:flex-col" aria-label="Booking steps">
      {STEPS.map((s, i) => {
        const state: StepState =
          i < index ? StepState.done : i === index ? StepState.current : StepState.todo;
        return (
          <li
            key={s.id}
            className="flex items-start gap-3"
            aria-current={state === StepState.current ? 'step' : undefined}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                state === StepState.done && 'border-tone-success bg-tone-success text-white',
                state === StepState.current && 'border-primary bg-primary text-primary-foreground',
                state === StepState.todo && 'text-muted-foreground',
              )}
            >
              {state === StepState.done ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            <div className="hidden leading-tight lg:block">
              <div
                className={cn(
                  'text-sm font-medium',
                  state === StepState.todo && 'text-muted-foreground',
                )}
              >
                {s.title}
              </div>
              <div className="text-xs text-muted-foreground">{s.hint}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({
  title,
  description,
  children,
  next,
  back,
  nextLabel = 'Continue',
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  next?: Step;
  back?: Step;
  nextLabel?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
      <div className="flex items-center justify-between border-t px-6 pt-4">
        {back ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link to="/design/booking-wizard" search={{ step: back }} />}
          >
            Back
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          <Button
            nativeButton={false}
            render={<Link to="/design/booking-wizard" search={{ step: next }} />}
          >
            {nextLabel}
            <ChevronRightIcon />
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function WhereStep() {
  return (
    <StepCard
      title="Where and what"
      description="Pick the warehouse you deliver to and what the truck carries. The load type decides the duration."
      next={PrototypeWizardStep.slot}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="tenant">Warehouse</FieldLabel>
          <NativeSelect id="tenant" defaultValue="acme">
            <NativeSelectOption value="acme">Acme Logistics GmbH</NativeSelectOption>
            <NativeSelectOption value="nordfrost">Nordfrost Lager AG</NativeSelectOption>
            <NativeSelectOption value="mueller">Müller Handel KG</NativeSelectOption>
          </NativeSelect>
          <FieldDescription>Only warehouses that invited Trans-Pol appear here.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="site">Site</FieldLabel>
          <NativeSelect id="site" defaultValue="site-hh">
            <NativeSelectOption value="site-hh">Hamburg DC · Europe/Berlin</NativeSelectOption>
            <NativeSelectOption value="site-buc">
              Bucharest Hub · Europe/Bucharest
            </NativeSelectOption>
          </NativeSelect>
        </Field>
        <FieldSet>
          <FieldLegend variant="label">Load type</FieldLegend>
          <RadioGroup defaultValue="pallets-in" className="grid gap-2 sm:grid-cols-3">
            {[
              ['pallets-in', 'Pallets inbound', 'Delivery · 60 min for up to 26 pallets'],
              ['pallets-out', 'Pallets outbound', 'Pick-up · 60 min for up to 26 pallets'],
              ['reefer-in', 'Reefer inbound', 'Delivery · chilled or frozen · 90 min'],
            ].map(([value, label, hint]) => (
              <FieldLabel
                key={value}
                htmlFor={`lt-${value}`}
                className="flex-col items-start rounded-lg border p-3 has-data-checked:border-primary has-data-checked:bg-accent"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value={value ?? ''} id={`lt-${value}`} />
                  <span className="font-medium">{label}</span>
                </div>
                <span className="text-xs font-normal text-muted-foreground">{hint}</span>
              </FieldLabel>
            ))}
          </RadioGroup>
        </FieldSet>
        <Field>
          <FieldLabel htmlFor="units">Load units</FieldLabel>
          <InputGroup className="w-48">
            <InputGroupInput id="units" type="number" defaultValue={33} />
            <InputGroupAddon align="inline-end">pallets</InputGroupAddon>
          </InputGroup>
          <FieldDescription>33 pallets take 90 minutes at this site.</FieldDescription>
        </Field>
      </FieldGroup>
    </StepCard>
  );
}

function SlotStep() {
  const [date, setDate] = useState('2026-10-21');
  const [time, setTime] = useState<string | undefined>('10:00');
  return (
    <StepCard
      title="When"
      description="Only start times that fit the site's hours, closures and free capacity are offered."
      back={PrototypeWizardStep.where}
      next={PrototypeWizardStep.avis}
    >
      <SlotPicker
        days={days}
        selectedDate={date}
        onSelectDate={setDate}
        slots={slots}
        selectedTime={time}
        onSelectTime={setTime}
        zone={site?.zoneLabel ?? 'CET'}
        viewerZoneHint="same as your time"
        durationLabel="90 min"
      />
      <p className="text-xs text-muted-foreground">
        Today is closed for booking: the site needs 4 hours lead time. The horizon ends on 9 Nov
        2026.
      </p>
    </StepCard>
  );
}

function AvisStep() {
  return (
    <StepCard
      title="Avis"
      description="Tell the warehouse what arrives. Fields marked required follow the site's settings."
      back={PrototypeWizardStep.slot}
      next={PrototypeWizardStep.confirmed}
      nextLabel="Confirm booking"
    >
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="plate">Licence plate</FieldLabel>
            <Input id="plate" placeholder="WGM 4521K" className="font-mono uppercase" />
            <FieldDescription>Optional here, confirmed at the gate.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="vehicle">Vehicle type</FieldLabel>
            <NativeSelect id="vehicle" defaultValue="semi">
              <NativeSelectOption value="semi">Semi-trailer</NativeSelectOption>
              <NativeSelectOption value="rigid">Rigid truck</NativeSelectOption>
              <NativeSelectOption value="van">Van</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field data-invalid>
            <FieldLabel htmlFor="po">Purchase order number (required)</FieldLabel>
            <Input id="po" aria-invalid defaultValue="4881" />
            <FieldError>PO numbers at Hamburg DC have the form PO-00000.</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="dn">Delivery note</FieldLabel>
            <Input id="dn" placeholder="DN-…" />
          </Field>
          <Field>
            <FieldLabel htmlFor="weight">Gross weight</FieldLabel>
            <InputGroup>
              <InputGroupInput id="weight" type="number" placeholder="18 400" />
              <InputGroupAddon align="inline-end">kg</InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">Driver phone</FieldLabel>
            <Input id="phone" type="tel" placeholder="+48 …" />
            <FieldDescription>
              Used by the dock to reach the driver. Deleted 7 days after the visit.
            </FieldDescription>
          </Field>
        </div>
        <FieldSet>
          <FieldLegend variant="label">Dangerous goods</FieldLegend>
          <label htmlFor="adr" className="flex items-center gap-2 text-sm">
            <Checkbox id="adr" /> This load contains ADR goods
          </label>
        </FieldSet>
        <Field>
          <FieldLabel htmlFor="notes">Notes for the warehouse</FieldLabel>
          <Textarea id="notes" placeholder="Tail lift needed, driver does not unload, …" />
        </Field>
      </FieldGroup>
    </StepCard>
  );
}

function ConfirmedStep() {
  if (!site) return null;
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-tone-success-border">
        <CardContent className="flex flex-col gap-6 pt-6 md:flex-row">
          <div className="flex flex-col items-center gap-2">
            <QrPlaceholder code="Z4KQ-7MDP" size={168} className="border" />
            <div className="font-mono text-2xl font-semibold tracking-wide">Z4KQ-7MDP</div>
            <BookingStatusBadge status={BookingStatus.confirmed} size={BadgeSize.lg} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold">Booked. See you on Wednesday.</h2>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Slot</dt>
              <dd className="font-medium">
                Wed 21 Oct 2026, <SiteTimeRange start="10:00" end="11:30" zone={site.zoneLabel} />
              </dd>
              <dt className="text-muted-foreground">Site</dt>
              <dd>
                {site.name}
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPinIcon className="size-3.5" /> {site.address}
                </div>
              </dd>
              <dt className="text-muted-foreground">Load</dt>
              <dd>33 pallets · Pallets inbound · PO-04881</dd>
              <dt className="text-muted-foreground">Changes</dt>
              <dd>Free until Wed 08:00 {site.zoneLabel}. After that call +49 40 123 456 78.</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                <CalendarPlusIcon /> Add to calendar
              </Button>
              <Button variant="outline" size="sm">
                <RefreshCwIcon /> Book again
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Driver link</CardTitle>
          <CardDescription>
            One link with the slot, the address, the safety briefing in the driver's language and
            the dock call. No app, no account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <InputGroup>
            <InputGroupInput
              readOnly
              value="https://app.rampflow.eu/d#••••••••••••"
              className="font-mono"
            />
            <InputGroupAddon align="inline-end">
              <Button variant="ghost" size="xs">
                <CopyIcon /> Copy
              </Button>
            </InputGroupAddon>
          </InputGroup>
          <div className="flex flex-wrap items-end gap-2">
            <Field className="w-64">
              <FieldLabel htmlFor="driver-email">Email to driver</FieldLabel>
              <Input id="driver-email" type="email" placeholder="driver@example.com" />
            </Field>
            <Field className="w-32">
              <FieldLabel htmlFor="driver-locale">Language</FieldLabel>
              <NativeSelect id="driver-locale" defaultValue="pl">
                {['de', 'en', 'pl', 'ro', 'bg', 'lt', 'uk', 'ru', 'cs', 'sk', 'hu', 'tr'].map(
                  (l) => (
                    <NativeSelectOption key={l} value={l}>
                      {l.toUpperCase()}
                    </NativeSelectOption>
                  ),
                )}
              </NativeSelect>
            </Field>
            <Button variant="outline">
              <MailIcon /> Send
            </Button>
            <Button variant="outline">
              <Share2Icon /> Share…
            </Button>
            <Button variant="ghost" className="ml-auto text-muted-foreground">
              Regenerate link
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({ step }: { step: Step }) {
  const rows: [string, string | undefined][] = [
    ['Warehouse', 'Acme Logistics GmbH'],
    ['Site', 'Hamburg DC'],
    ['Load', '33 pallets · inbound'],
    ['Duration', '90 min'],
    ['Slot', step === PrototypeWizardStep.where ? undefined : 'Wed 21 Oct, 10:00 CET'],
  ];
  return (
    <aside className="flex flex-col gap-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">Your booking</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={cn('text-right font-medium', !v && 'text-muted-foreground/60')}>
                  {v ?? '—'}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <p className="px-1 text-xs text-muted-foreground">
        Booking is free for carriers. Prefilled from your last booking at Hamburg DC on 12 Oct.
      </p>
    </aside>
  );
}
