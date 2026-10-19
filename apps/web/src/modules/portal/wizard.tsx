import {
  type Avis,
  AvisInput,
  LOAD_UNIT_TYPES,
  type LoadUnitType,
} from '@rampflow/shared/modules/avis/avis';
import type {
  CreateCarrierBooking,
  PortalBookingView,
  PortalLoadType,
  PortalSite,
} from '@rampflow/shared/modules/booking/api.portal';
import type { LocalDate } from '@rampflow/shared/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CheckIcon, ChevronRightIcon, WarehouseIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Controller, type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorText } from '@/components/app-shell/form-errors';
import { TenantLogo } from '@/components/tenant-logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { carrierContextQuery } from '@/lib/access';
import { ApiFailure, api, call } from '@/lib/api';
import { useSiteTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import {
  AvisFields,
  type AvisFormValues,
  applyAvisIssues,
  avisFormValues,
  avisResolver,
  emptyAvis,
} from '@/modules/booking/avis-form';
import { BookingStatusBadge, useLoadTypeName } from '@/modules/booking/display';
import { useRefreshOffers } from './actions';
import { AddressLines, CodeQr, CutoffNote, SlotText } from './booking-parts';
import { DriverLinkCard } from './driver-link';
import {
  portalBookingQuery,
  portalKey,
  portalLoadTypesQuery,
  portalSitesQuery,
  rebookQuery,
} from './queries';
import { PortalSlotPicker } from './slot-picker';
import { useDayStrip } from './use-offers';

// BK-04, BK-06, AV-01, CR-06: the booking wizard at /c/$orgId/book. Four steps in the URL;
// Back keeps the data. "Book again" (`from`) prefills warehouse, site, load type and the avis
// without references and driver, and opens on the time step, so a returning carrier books in a
// few clicks. A lost race (409 with offers) reopens the time step with the refreshed starts.

export const STEPS = ['where', 'when', 'avis', 'done'] as const;
export type Step = (typeof STEPS)[number];

export interface WizardSearch {
  step: Step;
  tenant?: string;
  from?: string;
  booking?: string;
}

interface Selection {
  tenantId: string;
  siteId: string;
  loadTypeId: string;
}

const totalUnits = (rows: AvisFormValues['loadUnits']) =>
  rows.reduce((sum, u) => sum + (Number(u.quantity) || 0), 0);

export function BookingWizard({
  orgId,
  search,
  go,
}: {
  orgId: string;
  search: WizardSearch;
  go: (search: WizardSearch) => void;
}) {
  const { t } = useTranslation('booking');
  const { t: tCore } = useTranslation('core');
  const queryClient = useQueryClient();
  const refreshOffers = useRefreshOffers(orgId);
  const context = useQuery(carrierContextQuery(orgId)).data;
  const tenants = (context?.tenants ?? []).filter(
    (x) => x.linkStatus === 'active' && x.carrierPortal,
  );
  const [selection, setSelection] = useState<Selection>({
    tenantId: tenants.find((x) => x.id === search.tenant)?.id ?? tenants[0]?.id ?? '',
    siteId: '',
    loadTypeId: '',
  });
  const [date, setDate] = useState<LocalDate | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const form = useForm<AvisFormValues, unknown, Avis>({
    resolver: avisResolver,
    defaultValues: emptyAvis(),
  });

  // BK-06: prefill once from the earlier booking, then continue on the time step.
  const prefill = useQuery({ ...rebookQuery(orgId, search.from ?? ''), enabled: !!search.from });
  const prefilledFrom = useRef<string | null>(null);
  useEffect(() => {
    const data = prefill.data;
    if (!data || prefilledFrom.current === search.from) return;
    prefilledFrom.current = search.from ?? null;
    setSelection({ tenantId: data.tenantId, siteId: data.siteId, loadTypeId: data.loadTypeId });
    setDate(null);
    setStartsAt(null);
    setClientRequestId(crypto.randomUUID());
    // The prefill leaves references out on purpose; the form starts with one empty row.
    const { references: _, ...rest } = data.avis;
    form.reset(
      avisFormValues({
        ...AvisInput.omit({ references: true }).parse(rest),
        references: [{ type: 'purchase_order', value: '' }],
        plateSeen: null,
      }),
    );
    go({ step: 'when', from: search.from });
  }, [prefill.data, search.from, form, go]);

  const sites = useQuery({
    ...portalSitesQuery(orgId, selection.tenantId),
    enabled: selection.tenantId !== '',
  });
  const site = sites.data?.find((s) => s.id === selection.siteId) ?? sites.data?.[0];
  const loadTypes = useQuery({
    ...portalLoadTypesQuery(orgId, selection.tenantId, site?.id ?? ''),
    enabled: site !== undefined,
  });
  const loadType =
    loadTypes.data?.find((lt) => lt.id === selection.loadTypeId) ?? loadTypes.data?.[0];
  const unitRows = useWatch({ control: form.control, name: 'loadUnits' });
  const loadUnits = totalUnits(unitRows);
  const request =
    site && loadType && loadUnits > 0
      ? { tenantId: selection.tenantId, siteId: site.id, loadTypeId: loadType.id, loadUnits }
      : null;
  const strip = useDayStrip(orgId, request, site, date);
  const firstOffered = strip.days.find((d) => (d.count ?? 0) > 0)?.date ?? null;
  const shownDate = date ?? firstOffered;
  const offers = strip.offersOn(shownDate);
  const duration =
    offers?.durationMinutes ?? strip.offersOn(strip.days[0]?.date ?? null)?.durationMinutes;

  const create = useMutation({
    mutationFn: (avis: Avis) => {
      if (!request || !startsAt) throw new Error('create without a chosen start');
      const body: CreateCarrierBooking = {
        clientRequestId,
        siteId: request.siteId,
        loadTypeId: request.loadTypeId,
        startsAt,
        avis,
      };
      return call<PortalBookingView>(
        api.c[':orgId'].at[':tenantId'].bookings.$post({
          param: { orgId, tenantId: request.tenantId },
          json: body,
        }),
      );
    },
    meta: { silent: true },
    onSuccess: async (booking) => {
      queryClient.setQueryData(portalBookingQuery(orgId, booking.id).queryKey, booking);
      await queryClient.invalidateQueries({ queryKey: [...portalKey(orgId), 'list'] });
      setClientRequestId(crypto.randomUUID());
      go({ step: 'done', booking: booking.id });
    },
    onError: (e) => {
      if (request && refreshOffers(e, request)) {
        setStartsAt(null);
        // A new attempt is a new request; the old id names no booking.
        setClientRequestId(crypto.randomUUID());
        toast.error(t(($) => $.portal.wizard.taken));
        go({ ...search, step: 'when' });
        return;
      }
      if (applyAvisIssues(e, form)) return;
      if (e instanceof ApiFailure) toast.error(errorText(tCore, e));
    },
  });
  if (tenants.length === 0) return <NoTenants orgId={orgId} />;
  if (search.step === 'done')
    return <Done orgId={orgId} bookingId={search.booking ?? ''} go={go} />;
  // A reload in the middle loses the form; start over where nothing is chosen yet.
  const step: Step = search.step !== 'where' && !request ? 'where' : search.step;

  const pick = (next: Partial<Selection>) => {
    setSelection((s) => ({ ...s, ...next }));
    setDate(null);
    setStartsAt(null);
  };
  const chosen = tenants.find((x) => x.id === selection.tenantId);
  const summary = {
    tenant: chosen ? (
      <span className="inline-flex items-center gap-2">
        <TenantLogo url={chosen.logoUrl} className="h-5 max-w-24" />
        {chosen.name}
      </span>
    ) : undefined,
    site,
    loadType,
    loadUnits,
    duration,
    startsAt,
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_17rem]">
      <Stepper current={step} />
      <div className="min-w-0">
        {step === 'where' ? (
          <WhereStep
            orgId={orgId}
            tenants={tenants}
            selection={{ ...selection, siteId: site?.id ?? '', loadTypeId: loadType?.id ?? '' }}
            onPick={pick}
            sites={sites.data}
            loadTypes={loadTypes.data}
            form={form}
            durationMinutes={duration}
            canContinue={request !== null}
            onNext={() => go({ ...search, step: 'when' })}
          />
        ) : null}
        {step === 'when' && site ? (
          <StepCard
            title={t(($) => $.portal.wizard.when.title)}
            description={t(($) => $.portal.wizard.when.description)}
            onBack={() => go({ ...search, step: 'where' })}
            onNext={() => go({ ...search, step: 'avis' })}
            canContinue={startsAt !== null}
          >
            <PortalSlotPicker
              days={strip.days}
              date={shownDate}
              onDate={(d) => {
                setDate(d);
                setStartsAt(null);
              }}
              starts={offers?.starts}
              value={startsAt}
              onChange={setStartsAt}
              timeZone={site.timeZone}
              durationMinutes={duration}
              onPrevious={strip.previous}
              onNext={strip.next}
            />
            <p className="text-xs text-muted-foreground">
              {t(($) => $.portal.wizard.when.rules, {
                hours: Math.round((site.leadMinutes / 60) * 10) / 10,
                days: site.horizonDays,
              })}
            </p>
          </StepCard>
        ) : null}
        {step === 'avis' && site && loadType ? (
          <form
            noValidate
            onSubmit={form.handleSubmit((avis) => create.mutate(avis))}
            aria-label={t(($) => $.portal.wizard.avis.title)}
          >
            <StepCard
              title={t(($) => $.portal.wizard.avis.title)}
              description={t(($) => $.portal.wizard.avis.description)}
              onBack={() => go({ ...search, step: 'when' })}
              submit={
                <Button type="submit" disabled={create.isPending || startsAt === null}>
                  {create.isPending ? <Spinner /> : null}
                  {t(($) => $.portal.wizard.avis.confirm)}
                </Button>
              }
            >
              <AvisFields form={form} direction={loadType.direction} rules={site.avisRules} />
            </StepCard>
          </form>
        ) : null}
      </div>
      <Summary {...summary} />
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const { t } = useTranslation('booking');
  const index = STEPS.indexOf(current);
  return (
    <ol className="flex gap-2 lg:flex-col" aria-label={t(($) => $.portal.wizard.steps)}>
      {STEPS.map((s, i) => {
        const state = i < index ? 'done' : i === index ? 'current' : 'todo';
        return (
          <li
            key={s}
            className="flex items-start gap-3"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                state === 'done' && 'border-tone-success bg-tone-success text-white',
                state === 'current' && 'border-primary bg-primary text-primary-foreground',
                state === 'todo' && 'text-muted-foreground',
              )}
            >
              {state === 'done' ? <CheckIcon className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <div className="hidden leading-tight lg:block">
              <div
                className={cn('text-sm font-medium', state === 'todo' && 'text-muted-foreground')}
              >
                {t(($) => $.portal.wizard[s].step)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(($) => $.portal.wizard[s].hint)}
              </div>
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
  onBack,
  onNext,
  canContinue = true,
  submit,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  canContinue?: boolean;
  submit?: React.ReactNode;
}) {
  const { t } = useTranslation('booking');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
      <div className="flex items-center justify-between border-t px-6 pt-4">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            {t(($) => $.portal.wizard.back)}
          </Button>
        ) : (
          <span />
        )}
        {submit ??
          (onNext ? (
            <Button type="button" onClick={onNext} disabled={!canContinue}>
              {t(($) => $.portal.wizard.continue)}
              <ChevronRightIcon />
            </Button>
          ) : null)}
      </div>
    </Card>
  );
}

function WhereStep({
  tenants,
  selection,
  onPick,
  sites,
  loadTypes,
  form,
  durationMinutes,
  canContinue,
  onNext,
}: {
  orgId: string;
  tenants: { id: string; name: string }[];
  selection: Selection;
  onPick: (next: Partial<Selection>) => void;
  sites: PortalSite[] | undefined;
  loadTypes: PortalLoadType[] | undefined;
  form: UseFormReturn<AvisFormValues, unknown, Avis>;
  durationMinutes: number | undefined;
  canContinue: boolean;
  onNext: () => void;
}) {
  const { t } = useTranslation('booking');
  const { t: tAvis } = useTranslation('avis');
  const id = useId();
  const loadTypeName = useLoadTypeName();
  const siteTime = useSiteTime();
  const now = new Date();
  const rows = useWatch({ control: form.control, name: 'loadUnits' });
  const units = totalUnits(rows);
  return (
    <StepCard
      title={t(($) => $.portal.wizard.where.title)}
      description={t(($) => $.portal.wizard.where.description)}
      onNext={onNext}
      canContinue={canContinue}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-tenant`}>{t(($) => $.portal.wizard.where.tenant)}</FieldLabel>
          <NativeSelect
            id={`${id}-tenant`}
            className="w-full"
            value={selection.tenantId}
            onChange={(e) => onPick({ tenantId: e.target.value, siteId: '', loadTypeId: '' })}
          >
            {tenants.map((x) => (
              <NativeSelectOption key={x.id} value={x.id}>
                {x.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>{t(($) => $.portal.wizard.where.tenant_hint)}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-site`}>{t(($) => $.portal.wizard.where.site)}</FieldLabel>
          {sites ? (
            <NativeSelect
              id={`${id}-site`}
              className="w-full"
              value={selection.siteId}
              onChange={(e) => onPick({ siteId: e.target.value, loadTypeId: '' })}
            >
              {sites.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name} · {siteTime(now, s.timeZone).zone}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : (
            <Skeleton className="h-8 w-full" />
          )}
        </Field>
        <FieldSet>
          <FieldLegend variant="label">{t(($) => $.portal.wizard.where.load_type)}</FieldLegend>
          {loadTypes === undefined ? (
            <Skeleton className="h-16 w-full" />
          ) : loadTypes.length === 0 ? (
            <FieldDescription>{t(($) => $.portal.wizard.where.no_load_types)}</FieldDescription>
          ) : (
            <RadioGroup
              value={selection.loadTypeId}
              onValueChange={(v) => onPick({ loadTypeId: String(v) })}
              className="grid gap-2 sm:grid-cols-3"
            >
              {loadTypes.map((lt) => (
                <FieldLabel
                  key={lt.id}
                  htmlFor={`${id}-lt-${lt.id}`}
                  className="flex-col items-start rounded-lg border p-3 has-data-checked:border-primary has-data-checked:bg-accent"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value={lt.id} id={`${id}-lt-${lt.id}`} />
                    <span className="font-medium">{loadTypeName(lt.name)}</span>
                  </div>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t(($) => $.portal.direction[lt.direction])}
                  </span>
                </FieldLabel>
              ))}
            </RadioGroup>
          )}
        </FieldSet>
        <div className="flex flex-wrap items-start gap-3">
          <Controller
            control={form.control}
            name="loadUnits.0.quantity"
            render={({ field, fieldState }) => (
              <Field className="w-40" data-invalid={units <= 0 && fieldState.isTouched}>
                <FieldLabel htmlFor={`${id}-units`}>
                  {t(($) => $.portal.wizard.where.units)}
                </FieldLabel>
                <Input
                  id={`${id}-units`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  {...field}
                  aria-invalid={units <= 0 && fieldState.isTouched}
                />
                <FieldError>
                  {units <= 0 && fieldState.isTouched
                    ? t(($) => $.portal.wizard.where.units_required)
                    : null}
                </FieldError>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="loadUnits.0.type"
            render={({ field }) => (
              <Field className="w-56">
                <FieldLabel htmlFor={`${id}-unit-type`}>
                  {t(($) => $.portal.wizard.where.unit_type)}
                </FieldLabel>
                <NativeSelect
                  id={`${id}-unit-type`}
                  className="w-full"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value as LoadUnitType)}
                >
                  {LOAD_UNIT_TYPES.map((u) => (
                    <NativeSelectOption key={u} value={u}>
                      {tAvis(($) => $.avis.loadUnitType[u])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          />
        </div>
        {rows.length > 1 ? (
          <FieldDescription>
            {t(($) => $.portal.wizard.where.more_rows, { units })}
          </FieldDescription>
        ) : null}
        {durationMinutes !== undefined && units > 0 ? (
          <p className="text-sm">
            {t(($) => $.portal.wizard.where.duration, { units, minutes: durationMinutes })}
          </p>
        ) : null}
      </FieldGroup>
    </StepCard>
  );
}

function Summary({
  tenant,
  site,
  loadType,
  loadUnits,
  duration,
  startsAt,
}: {
  tenant: React.ReactNode;
  site: PortalSite | undefined;
  loadType: PortalLoadType | undefined;
  loadUnits: number;
  duration: number | undefined;
  startsAt: string | null;
}) {
  const { t } = useTranslation('booking');
  const loadTypeName = useLoadTypeName();
  const rows: [string, React.ReactNode][] = [
    [t(($) => $.portal.summary.tenant), tenant],
    [t(($) => $.portal.summary.site), site?.name],
    [
      t(($) => $.portal.summary.load),
      loadType && loadUnits > 0 ? `${loadUnits} · ${loadTypeName(loadType.name)}` : undefined,
    ],
    [
      t(($) => $.portal.summary.duration),
      duration === undefined ? undefined : t(($) => $.portal.minutes, { minutes: duration }),
    ],
    [
      t(($) => $.portal.summary.slot),
      startsAt && site && duration !== undefined ? (
        <SlotText
          key="slot"
          startsAt={startsAt}
          endsAt={new Date(Date.parse(startsAt) + duration * 60_000).toISOString()}
          timeZone={site.timeZone}
        />
      ) : undefined,
    ],
  ];
  return (
    <aside className="flex flex-col gap-3" aria-label={t(($) => $.portal.summary.title)}>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">{t(($) => $.portal.summary.title)}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={cn('text-right font-medium', !v && 'text-muted-foreground')}>
                  {v ?? '–'}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <p className="px-1 text-xs text-muted-foreground">{t(($) => $.portal.summary.free)}</p>
    </aside>
  );
}

function Done({
  orgId,
  bookingId,
  go,
}: {
  orgId: string;
  bookingId: string;
  go: (search: WizardSearch) => void;
}) {
  const { t } = useTranslation('booking');
  const loadTypeName = useLoadTypeName();
  const booking = useQuery({ ...portalBookingQuery(orgId, bookingId), enabled: bookingId !== '' });
  const b = booking.data;
  if (!b) return <Skeleton className="mx-auto h-64 w-full max-w-4xl" />;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <Card className="border-tone-success-border">
        <CardContent className="flex flex-col gap-6 md:flex-row">
          <div className="flex flex-col items-center gap-2">
            <CodeQr value={b.code} label={t(($) => $.portal.qr, { code: b.code })} size={168} />
            <div
              className="font-mono text-2xl font-semibold tracking-wide"
              data-testid="booking-code"
            >
              {b.code}
            </div>
            <BookingStatusBadge status={b.status} size="lg" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold">{t(($) => $.portal.done.title)}</h2>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t(($) => $.portal.summary.slot)}</dt>
              <dd className="font-medium">
                <SlotText startsAt={b.startsAt} endsAt={b.endsAt} timeZone={b.timeZone} />
              </dd>
              <dt className="text-muted-foreground">{t(($) => $.portal.summary.site)}</dt>
              <dd>
                {b.tenant.name} · {b.site.name}
                <div className="text-muted-foreground">
                  <AddressLines address={b.site.address} />
                </div>
              </dd>
              <dt className="text-muted-foreground">{t(($) => $.portal.summary.load)}</dt>
              <dd>
                {b.loadUnits} · {loadTypeName(b.loadType.name)}
                {b.reference ? ` · ${b.reference}` : ''}
              </dd>
              <dt className="text-muted-foreground">{t(($) => $.portal.done.changes)}</dt>
              <dd>
                <CutoffNote booking={b} />
              </dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => go({ step: 'when', from: b.id })}>
                {t(($) => $.portal.actions.book_again)}
              </Button>
              <Link
                to="/c/$orgId/bookings/$bookingId"
                params={{ orgId, bookingId: b.id }}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                {t(($) => $.portal.done.open)}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
      <DriverLinkCard orgId={orgId} booking={b} />
    </div>
  );
}

function NoTenants({ orgId }: { orgId: string }) {
  const { t } = useTranslation('booking');
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WarehouseIcon />
        </EmptyMedia>
        <EmptyTitle>{t(($) => $.portal.wizard.no_tenants_title)}</EmptyTitle>
        <EmptyDescription>{t(($) => $.portal.wizard.no_tenants)}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link
          to="/c/$orgId/tenants"
          params={{ orgId }}
          className={buttonVariants({ variant: 'outline' })}
        >
          {t(($) => $.portal.wizard.tenants)}
        </Link>
      </EmptyContent>
    </Empty>
  );
}
