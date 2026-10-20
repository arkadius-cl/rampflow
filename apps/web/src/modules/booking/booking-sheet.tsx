import { zodResolver } from '@hookform/resolvers/zod';
import { type Avis, AvisInput } from '@rampflow/shared/modules/avis/avis';
import type { BookingView, CreateStaffBooking } from '@rampflow/shared/modules/booking/api.staff';
import { Direction } from '@rampflow/shared/modules/booking/values';
import { type LocalDate, localDateSchema } from '@rampflow/shared/time';
import { ErrorCode, Permission } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as z from 'zod';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useAccess } from '@/lib/access';
import { ApiFailure, api, call } from '@/lib/api';
import { useSiteTime } from '@/lib/time';
import { randomId } from '@/lib/utils';
import {
  AvisFields,
  type AvisFormValues,
  applyAvisIssues,
  avisResolver,
  emptyAvis,
  toAvisInput,
  useAvisRules,
} from './avis-form';
import { useLoadTypeName } from './display';
import {
  availabilityQuery,
  boardQuery,
  bookingKey,
  carrierOptionsQuery,
  loadTypesQuery,
} from './queries';
import { StartPicker, startOptions } from './start-picker';

// BK-02: the staff booking sheet of the plan board. Capacity applies, lead time and horizon do
// not; a time the rules do not offer books only with `booking.force` and a reason, which the
// event log records.

const SheetFields = z
  .object({
    carrierKind: z.enum(['linked', 'other']),
    carrierId: z.string(),
    carrierName: z.string().trim().max(120),
    loadTypeId: z.string().min(1),
    date: localDateSchema,
    resourceId: z.string(),
    startsAt: z.string().min(1),
    forceReason: z.string().trim().max(500),
  })
  .superRefine((v, ctx) => {
    if (v.carrierKind === 'linked' && v.carrierId === '') {
      ctx.addIssue({ code: 'custom', path: ['carrierId'], message: 'Choose a carrier' });
    }
    if (v.carrierKind === 'other' && v.carrierName === '') {
      ctx.addIssue({ code: 'custom', path: ['carrierName'], message: 'Name the carrier' });
    }
  });
type SheetInput = z.input<typeof SheetFields>;
type SheetOutput = z.output<typeof SheetFields>;

const FORCE_REASONS = new Set(['capacity_full', 'daily_cap_reached']);

export function BookingSheet({
  orgId,
  siteId,
  timeZone,
  date,
  open,
  onOpenChange,
  onCreated,
}: {
  orgId: string;
  siteId: string;
  timeZone: string;
  date: LocalDate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (booking: BookingView) => void;
}) {
  const { t } = useTranslation('booking');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>{t(($) => $.plan.sheet.title)}</SheetTitle>
          <SheetDescription>{t(($) => $.plan.sheet.description)}</SheetDescription>
        </SheetHeader>
        {open ? (
          <SheetForm
            orgId={orgId}
            siteId={siteId}
            timeZone={timeZone}
            date={date}
            onCancel={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetForm({
  orgId,
  siteId,
  timeZone,
  date,
  onCancel,
  onCreated,
}: {
  orgId: string;
  siteId: string;
  timeZone: string;
  date: LocalDate;
  onCancel: () => void;
  onCreated: (booking: BookingView) => void;
}) {
  const { t } = useTranslation('booking');
  const id = useId();
  const access = useAccess();
  const canForce = access.can(Permission.booking.force);
  const queryClient = useQueryClient();
  const loadTypeName = useLoadTypeName();
  const siteTime = useSiteTime();
  const rules = useAvisRules(siteId);
  // One id per sheet: a retried submit returns the first booking instead of a second one.
  const [clientRequestId] = useState(() => randomId());
  const [forceNeeded, setForceNeeded] = useState(false);

  const carriers = useQuery(carrierOptionsQuery(orgId));
  const loadTypes = useQuery(loadTypesQuery(orgId, siteId));
  const form = useForm<SheetInput, unknown, SheetOutput>({
    resolver: zodResolver(SheetFields),
    defaultValues: {
      carrierKind: 'linked',
      carrierId: '',
      carrierName: '',
      loadTypeId: '',
      date,
      resourceId: '',
      startsAt: '',
      forceReason: '',
    },
  });
  const avisForm = useForm<AvisFormValues, unknown, Avis>({
    resolver: avisResolver,
    defaultValues: emptyAvis(),
  });

  const firstLoadType = loadTypes.data?.[0]?.id;
  useEffect(() => {
    if (firstLoadType && form.getValues('loadTypeId') === '') {
      form.setValue('loadTypeId', firstLoadType);
    }
  }, [firstLoadType, form]);
  const noLinkedCarriers = carriers.data?.length === 0;
  useEffect(() => {
    if (noLinkedCarriers) form.setValue('carrierKind', 'other');
  }, [noLinkedCarriers, form]);

  const [carrierKind, loadTypeId, day, resourceId, startsAt] = useWatch({
    control: form.control,
    name: ['carrierKind', 'loadTypeId', 'date', 'resourceId', 'startsAt'],
  });
  const units = useWatch({ control: avisForm.control, name: 'loadUnits' });
  const loadUnits = units.reduce((sum, u) => sum + (Number(u.quantity) || 0), 0);
  const validDay = localDateSchema.safeParse(day).data ?? date;
  const loadType = loadTypes.data?.find((lt) => lt.id === loadTypeId);
  const board = useQuery({ ...boardQuery(orgId, siteId, validDay), refetchInterval: false });
  const offers = useQuery({
    ...availabilityQuery(orgId, {
      siteId,
      date: validDay,
      loadTypeId,
      loadUnits,
      ...(resourceId ? { resourceId } : {}),
    }),
    enabled: loadTypeId !== '',
  });
  const eligible = resourceId ? [resourceId] : loadType?.resourceIds;
  const options = board.data ? startOptions(board.data, offers.data, eligible) : [];
  const chosen = options.find((o) => o.startsAt === startsAt);
  const forcing = forceNeeded || (chosen !== undefined && !chosen.offered);

  useEffect(() => {
    if (startsAt !== '' && options.length > 0 && !chosen) form.setValue('startsAt', '');
  }, [startsAt, options.length, chosen, form]);

  const create = useMutation({
    mutationFn: (body: CreateStaffBooking) =>
      call<BookingView>(api.t[':orgId'].bookings.$post({ param: { orgId }, json: body })),
    onSuccess: async (booking) => {
      await queryClient.invalidateQueries({ queryKey: bookingKey(orgId) });
      toast.success(t(($) => $.plan.sheet.created, { code: booking.code }));
      onCreated(booking);
    },
    onError: (e) => {
      applyAvisIssues(e, avisForm);
      if (!(e instanceof ApiFailure)) return;
      for (const issue of e.issues) {
        const [first] = issue.path;
        if (first === 'forceReason' || first === 'startsAt' || first === 'loadTypeId') {
          form.setError(first, { type: issue.code });
        }
        if (first === 'carrier') form.setError('carrierName', { type: issue.code });
      }
      if (e.code === ErrorCode.conflict && FORCE_REASONS.has(e.conflictReason ?? '')) {
        setForceNeeded(canForce);
        void queryClient.invalidateQueries({ queryKey: bookingKey(orgId) });
      }
    },
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    // Both forms validate at once, so every error shows after one click.
    const [fieldsOk, avisOk] = await Promise.all([form.trigger(), avisForm.trigger()]);
    if (!fieldsOk || !avisOk) return;
    const v = SheetFields.parse(form.getValues());
    if (forcing && v.forceReason === '') {
      form.setError('forceReason', { type: 'too_small' });
      return;
    }
    create.mutate({
      clientRequestId,
      siteId,
      loadTypeId: v.loadTypeId,
      startsAt: v.startsAt,
      ...(v.resourceId ? { resourceId: v.resourceId } : {}),
      carrier: v.carrierKind === 'linked' ? { id: v.carrierId } : { name: v.carrierName },
      avis: AvisInput.parse(toAvisInput(avisForm.getValues())),
      ...(forcing ? { force: true, forceReason: v.forceReason } : {}),
    });
  };

  const resources = (board.data?.resources ?? []).filter(
    (r) => !loadType || loadType.resourceIds.includes(r.id),
  );
  const fieldError = (name: keyof SheetInput) => {
    const error = form.formState.errors[name];
    if (!error) return undefined;
    if (name === 'forceReason') return t(($) => $.plan.sheet.force_reason_required);
    if (name === 'startsAt') return t(($) => $.plan.sheet.choose_time);
    return t(($) => $.plan.validation.required);
  };

  return (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{t(($) => $.plan.sheet.carrier)}</FieldLegend>
            <Controller
              name="carrierKind"
              control={form.control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                  className="flex flex-wrap gap-4"
                >
                  <Field orientation="horizontal" className="w-auto">
                    <RadioGroupItem
                      value="linked"
                      id={`${id}-linked`}
                      disabled={noLinkedCarriers}
                    />
                    <FieldLabel htmlFor={`${id}-linked`} className="font-normal">
                      {t(($) => $.plan.sheet.linked_carrier)}
                    </FieldLabel>
                  </Field>
                  <Field orientation="horizontal" className="w-auto">
                    <RadioGroupItem value="other" id={`${id}-other`} />
                    <FieldLabel htmlFor={`${id}-other`} className="font-normal">
                      {t(($) => $.plan.sheet.other_carrier)}
                    </FieldLabel>
                  </Field>
                </RadioGroup>
              )}
            />
            {carrierKind === 'linked' ? (
              <Controller
                name="carrierId"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${id}-carrier`}>
                      {t(($) => $.plan.sheet.carrier_name)}
                    </FieldLabel>
                    <NativeSelect
                      {...field}
                      id={`${id}-carrier`}
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                    >
                      <NativeSelectOption value="">
                        {t(($) => $.plan.sheet.choose_carrier)}
                      </NativeSelectOption>
                      {(carriers.data ?? []).map((c) => (
                        <NativeSelectOption key={c.id} value={c.id}>
                          {c.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError>{fieldError('carrierId')}</FieldError>
                  </Field>
                )}
              />
            ) : (
              <Controller
                name="carrierName"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`${id}-carrier-name`}>
                      {t(($) => $.plan.sheet.carrier_name)}
                    </FieldLabel>
                    <Input
                      {...field}
                      id={`${id}-carrier-name`}
                      autoComplete="organization"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>{t(($) => $.plan.sheet.other_carrier_hint)}</FieldDescription>
                    <FieldError>{fieldError('carrierName')}</FieldError>
                  </Field>
                )}
              />
            )}
          </FieldSet>

          <div className="grid gap-4 sm:grid-cols-3">
            <Controller
              name="loadTypeId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-load-type`}>
                    {t(($) => $.plan.sheet.load_type)}
                  </FieldLabel>
                  <NativeSelect
                    {...field}
                    id={`${id}-load-type`}
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                    onChange={(e) => {
                      field.onChange(e);
                      form.setValue('resourceId', '');
                    }}
                  >
                    {(loadTypes.data ?? []).map((lt) => (
                      <NativeSelectOption key={lt.id} value={lt.id}>
                        {loadTypeName(lt.name)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldError>{fieldError('loadTypeId')}</FieldError>
                </Field>
              )}
            />
            <Controller
              name="date"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-date`}>{t(($) => $.plan.sheet.date)}</FieldLabel>
                  <Input
                    {...field}
                    id={`${id}-date`}
                    type="date"
                    aria-invalid={fieldState.invalid}
                    onChange={(e) => {
                      field.onChange(e);
                      form.setValue('startsAt', '');
                      setForceNeeded(false);
                    }}
                  />
                  <FieldError>{fieldError('date')}</FieldError>
                </Field>
              )}
            />
            <Controller
              name="resourceId"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={`${id}-resource`}>
                    {t(($) => $.plan.sheet.resource)}
                  </FieldLabel>
                  <NativeSelect {...field} id={`${id}-resource`} className="w-full">
                    <NativeSelectOption value="">
                      {t(($) => $.plan.sheet.any_resource)}
                    </NativeSelectOption>
                    {resources.map((r) => (
                      <NativeSelectOption key={r.id} value={r.id}>
                        {r.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            />
          </div>

          <Field data-invalid={form.formState.errors.startsAt !== undefined}>
            <FieldTitle id={`${id}-time`}>{t(($) => $.plan.sheet.start_time)}</FieldTitle>
            <FieldDescription>
              {offers.data
                ? t(($) => $.plan.sheet.time_hint, {
                    zone: siteTime(`${validDay}T12:00:00Z`, timeZone).zone,
                    minutes: offers.data.durationMinutes,
                  })
                : null}
            </FieldDescription>
            {board.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <Controller
                name="startsAt"
                control={form.control}
                render={({ field }) => (
                  <StartPicker
                    options={options}
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      setForceNeeded(false);
                    }}
                    canForce={canForce}
                    timeZone={timeZone}
                    labelledBy={`${id}-time`}
                    invalid={form.formState.errors.startsAt !== undefined}
                  />
                )}
              />
            )}
            <FieldError>{fieldError('startsAt')}</FieldError>
          </Field>

          {forcing ? (
            <Alert className="border-tone-onsite-border bg-tone-onsite-bg">
              <AlertTitle>{t(($) => $.plan.sheet.force_title)}</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 text-foreground">
                <span>
                  {canForce
                    ? t(($) => $.plan.sheet.force_description)
                    : t(($) => $.plan.sheet.force_denied)}
                </span>
                {canForce ? (
                  <Controller
                    name="forceReason"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={`${id}-force-reason`}>
                          {t(($) => $.plan.sheet.force_reason)}
                        </FieldLabel>
                        <Textarea
                          {...field}
                          id={`${id}-force-reason`}
                          rows={2}
                          className="bg-background"
                          aria-invalid={fieldState.invalid}
                        />
                        <FieldError>{fieldError('forceReason')}</FieldError>
                      </Field>
                    )}
                  />
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <Separator />
          <FieldSet>
            <FieldLegend>{t(($) => $.plan.sheet.avis)}</FieldLegend>
            <AvisFields
              form={avisForm}
              direction={loadType?.direction ?? Direction.inbound}
              rules={rules}
            />
          </FieldSet>
        </FieldGroup>
      </div>
      <SheetFooter className="flex-row justify-end border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t(($) => $.plan.actions.close)}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Spinner /> : null}
          {forcing ? t(($) => $.plan.sheet.submit_force) : t(($) => $.plan.sheet.submit)}
        </Button>
      </SheetFooter>
    </form>
  );
}
