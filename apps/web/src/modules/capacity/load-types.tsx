import { zodResolver } from '@hookform/resolvers/zod';
import {
  LoadTypeDuration,
  type LoadTypeView,
  PutLoadTypeResources,
  type ResourceView,
  UpdateLoadType,
} from '@rampflow/shared/modules/booking/api.capacity';
import { Direction } from '@rampflow/shared/modules/booking/values';
import type { DockView } from '@rampflow/shared/modules/core/api.sites';
import { Feature, InputKind, StaffLocale, values } from '@rampflow/shared/values';
import { useMutation } from '@tanstack/react-query';
import { LockIcon, PencilIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as z from 'zod';
import { applyServerIssues } from '@/components/app-shell/form-errors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAccess } from '@/lib/access';
import { api, call } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { numberOrNull, useIssueText } from './form';
import { resourceLabel } from './hours';
import { useRefreshMasterData } from './queries';

// MD-05: load types of a site with name (de, en), direction, duration, buffer, eligible
// resources and the carrier-bookable flag. Tiered durations need `booking.duration_rules`.

const [FixedDuration, TieredDuration] = LoadTypeDuration.options;

/**
 * The form keeps both duration shapes, so switching between fixed and tiers loses nothing; only
 * the chosen one is validated, with the shared schema's own rules.
 */
const LoadTypeForm = UpdateLoadType.pick({
  name: true,
  direction: true,
  bufferMinutes: true,
  carrierBookable: true,
  active: true,
})
  .required()
  .extend({
    durationKind: z.enum(['fixed', 'tiers']),
    minutes: z.number().nullable(),
    tiers: z.array(z.object({ upTo: z.number().nullable(), minutes: z.number().nullable() })),
    resourceIds: PutLoadTypeResources.shape.resourceIds,
  })
  .superRefine((v, ctx) => {
    const [path, parsed] =
      v.durationKind === 'fixed'
        ? [['minutes'], FixedDuration.shape.minutes.safeParse(v.minutes)]
        : [['tiers'], TieredDuration.shape.tiers.safeParse(v.tiers)];
    for (const issue of parsed.error?.issues ?? []) {
      ctx.addIssue({ ...issue, path: [...path, ...issue.path] });
    }
  });
type LoadTypeValues = z.infer<typeof LoadTypeForm>;

const durationOf = (v: LoadTypeValues): LoadTypeDuration =>
  v.durationKind === 'fixed'
    ? { kind: 'fixed', minutes: v.minutes ?? 0 }
    : { kind: 'tiers', tiers: v.tiers.map((t) => ({ upTo: t.upTo, minutes: t.minutes ?? 0 })) };

const valuesOf = (lt: LoadTypeView | null): LoadTypeValues => ({
  name: lt?.name ?? { de: '', en: '' },
  direction: lt?.direction ?? Direction.inbound,
  bufferMinutes: lt?.bufferMinutes ?? 0,
  carrierBookable: lt?.carrierBookable ?? true,
  active: lt?.active ?? true,
  durationKind: lt?.duration.kind ?? 'fixed',
  minutes: lt?.duration.kind === 'fixed' ? lt.duration.minutes : 60,
  tiers:
    lt?.duration.kind === 'tiers'
      ? lt.duration.tiers
      : [
          { upTo: 16, minutes: 30 },
          { upTo: null, minutes: 60 },
        ],
  resourceIds: lt?.resourceIds ?? [],
});

function DurationText({ duration }: { duration: LoadTypeDuration }) {
  const { t } = useTranslation('booking');
  if (duration.kind === 'fixed') {
    return <>{t(($) => $.capacity.load_types.minutes, { n: duration.minutes })}</>;
  }
  return (
    <span className="flex flex-col">
      {duration.tiers.map((tier) => (
        <span key={tier.upTo ?? 'rest'} className="tabular-nums">
          {tier.upTo === null
            ? t(($) => $.capacity.load_types.tier_rest, { minutes: tier.minutes })
            : t(($) => $.capacity.load_types.tier_up_to, {
                upTo: tier.upTo,
                minutes: tier.minutes,
              })}
        </span>
      ))}
    </span>
  );
}

export function LoadTypesCard({
  orgId,
  siteId,
  loadTypes,
  resources,
  docks,
}: {
  orgId: string;
  siteId: string;
  loadTypes: LoadTypeView[];
  resources: ResourceView[];
  docks: DockView[];
}) {
  const { t } = useTranslation('booking');
  const locale = useLocale();
  const [editing, setEditing] = useState<{ loadType: LoadTypeView | null } | null>(null);
  const label = (r: ResourceView) => resourceLabel(r, docks);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(($) => $.capacity.load_types.title)}</CardTitle>
        <CardDescription>{t(($) => $.capacity.load_types.description)}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setEditing({ loadType: null })}>
            <PlusIcon /> {t(($) => $.capacity.load_types.new)}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{t(($) => $.capacity.load_types.columns.name)}</TableHead>
              <TableHead>{t(($) => $.capacity.load_types.columns.direction)}</TableHead>
              <TableHead>{t(($) => $.capacity.load_types.columns.duration)}</TableHead>
              <TableHead>{t(($) => $.capacity.load_types.columns.buffer)}</TableHead>
              <TableHead>{t(($) => $.capacity.load_types.columns.resources)}</TableHead>
              <TableHead>{t(($) => $.capacity.load_types.columns.carriers)}</TableHead>
              <TableHead className="pr-6">
                <span className="sr-only">{t(($) => $.capacity.load_types.columns.actions)}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadTypes.map((lt) => {
              const name = locale === StaffLocale.de ? lt.name.de : lt.name.en;
              const eligible = resources.filter((r) => lt.resourceIds.includes(r.id));
              return (
                <TableRow key={lt.id} className={cn(!lt.active && 'text-muted-foreground')}>
                  <TableCell className="pl-6 font-medium">
                    {name}
                    {lt.active ? null : (
                      <Badge variant="outline" className="ml-2">
                        {t(($) => $.capacity.load_types.inactive)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{t(($) => $.capacity.directions[lt.direction])}</TableCell>
                  <TableCell>
                    <DurationText duration={lt.duration} />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {t(($) => $.capacity.load_types.minutes, { n: lt.bufferMinutes })}
                  </TableCell>
                  <TableCell>
                    {eligible.length === 0 ? (
                      <span className="text-muted-foreground">
                        {t(($) => $.capacity.load_types.no_resources)}
                      </span>
                    ) : (
                      eligible.map(label).join(', ')
                    )}
                  </TableCell>
                  <TableCell>
                    {lt.carrierBookable
                      ? t(($) => $.capacity.load_types.carrier_yes)
                      : t(($) => $.capacity.load_types.carrier_no)}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t(($) => $.capacity.load_types.edit, { name })}
                      onClick={() => setEditing({ loadType: lt })}
                    >
                      <PencilIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <Sheet open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {editing?.loadType
                ? t(($) => $.capacity.load_types.edit, {
                    name:
                      locale === StaffLocale.de
                        ? editing.loadType.name.de
                        : editing.loadType.name.en,
                  })
                : t(($) => $.capacity.load_types.new)}
            </SheetTitle>
            <SheetDescription>{t(($) => $.capacity.load_types.form_description)}</SheetDescription>
          </SheetHeader>
          {editing ? (
            <LoadTypeFormView
              orgId={orgId}
              siteId={siteId}
              loadType={editing.loadType}
              resources={resources.filter((r) => r.active && r.dockIds.length > 0)}
              label={label}
              onDone={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function LoadTypeFormView({
  orgId,
  siteId,
  loadType,
  resources,
  label,
  onDone,
}: {
  orgId: string;
  siteId: string;
  loadType: LoadTypeView | null;
  resources: ResourceView[];
  label: (r: ResourceView) => string;
  onDone: () => void;
}) {
  const { t } = useTranslation('booking');
  const message = useIssueText();
  const { has } = useAccess();
  const tiersOn = has(Feature.booking.duration_rules);
  const refresh = useRefreshMasterData(orgId);
  const form = useForm<LoadTypeValues>({
    resolver: zodResolver(LoadTypeForm),
    defaultValues: valuesOf(loadType),
  });
  const tiers = useFieldArray({ control: form.control, name: 'tiers' });
  const kind = useWatch({ control: form.control, name: 'durationKind' });
  const direction = useWatch({ control: form.control, name: 'direction' });

  const save = useMutation({
    mutationFn: async (v: LoadTypeValues) => {
      const { durationKind: _k, minutes: _m, tiers: _t, resourceIds, ...fields } = v;
      const duration = durationOf(v);
      if (!loadType) {
        return call(
          api.t[':orgId'].capacity['load-types'].$post({
            param: { orgId },
            json: { siteId, ...fields, duration, resourceIds },
          }),
        );
      }
      const param = { orgId, loadTypeId: loadType.id };
      // An unchanged tiered duration is left out, so a package without duration rules can
      // still edit the other fields of a tiered type.
      const durationChanged = JSON.stringify(duration) !== JSON.stringify(loadType.duration);
      await call(
        api.t[':orgId'].capacity['load-types'][':loadTypeId'].$patch({
          param,
          json: durationChanged ? { ...fields, duration } : fields,
        }),
      );
      return call(
        api.t[':orgId'].capacity['load-types'][':loadTypeId'].resources.$put({
          param,
          json: { resourceIds },
        }),
      );
    },
    onSuccess: async () => {
      await refresh();
      toast.success(t(($) => $.capacity.load_types.saved));
      onDone();
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });

  const minutesInput = (
    name: 'minutes' | 'bufferMinutes' | `tiers.${number}.minutes` | `tiers.${number}.upTo`,
    label: string,
    unit: string,
    o: { hideLabel?: boolean; step?: number } = {},
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {o.hideLabel ? null : <FieldLabel htmlFor={`lt-${name}`}>{label}</FieldLabel>}
          <InputGroup>
            <InputGroupInput
              id={`lt-${name}`}
              type="number"
              min={0}
              step={o.step ?? 5}
              inputMode="numeric"
              aria-label={o.hideLabel ? label : undefined}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={(field.value as number | null | undefined) ?? ''}
              onChange={(e) => field.onChange(numberOrNull(e.target.value))}
              aria-invalid={fieldState.invalid}
            />
            <InputGroupAddon align="inline-end">{unit}</InputGroupAddon>
          </InputGroup>
          <FieldError>{message(fieldState.error, InputKind.number)}</FieldError>
        </Field>
      )}
    />
  );
  const minUnit = t(($) => $.capacity.load_types.min_unit);

  return (
    <form
      noValidate
      className="flex flex-1 flex-col"
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
    >
      <FieldGroup className="px-4">
        <div className="grid grid-cols-2 gap-3">
          {(['de', 'en'] as const).map((lang) => (
            <Controller
              key={lang}
              name={`name.${lang}`}
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`lt-name-${lang}`}>
                    {lang === StaffLocale.de
                      ? t(($) => $.capacity.load_types.fields.name_de)
                      : t(($) => $.capacity.load_types.fields.name_en)}
                  </FieldLabel>
                  <Input id={`lt-name-${lang}`} {...field} aria-invalid={fieldState.invalid} />
                  <FieldError>{message(fieldState.error)}</FieldError>
                </Field>
              )}
            />
          ))}
        </div>
        <Controller
          name="direction"
          control={form.control}
          render={({ field }) => (
            <FieldSet>
              <FieldLegend variant="label">
                {t(($) => $.capacity.load_types.fields.direction)}
              </FieldLegend>
              <ToggleGroup
                variant="outline"
                value={[field.value]}
                onValueChange={(v) => (v[0] ? field.onChange(v[0]) : null)}
                aria-label={t(($) => $.capacity.load_types.fields.direction)}
              >
                {values(Direction).map((d) => (
                  <ToggleGroupItem key={d} value={d}>
                    {t(($) => $.capacity.directions[d])}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldSet>
          )}
        />
        <Controller
          name="durationKind"
          control={form.control}
          render={({ field }) => (
            <FieldSet>
              <FieldLegend variant="label">
                {t(($) => $.capacity.load_types.fields.duration)}
              </FieldLegend>
              <ToggleGroup
                variant="outline"
                value={[field.value]}
                onValueChange={(v) => (v[0] ? field.onChange(v[0]) : null)}
                aria-label={t(($) => $.capacity.load_types.fields.duration)}
              >
                <ToggleGroupItem value="fixed">
                  {t(($) => $.capacity.load_types.fixed)}
                </ToggleGroupItem>
                <ToggleGroupItem value="tiers" disabled={!tiersOn && field.value !== 'tiers'}>
                  {t(($) => $.capacity.load_types.tiered)}
                </ToggleGroupItem>
              </ToggleGroup>
              {tiersOn ? null : (
                <FieldDescription className="flex items-center gap-1.5">
                  <LockIcon className="size-3.5" aria-hidden />
                  {t(($) => $.capacity.load_types.tiers_off)}
                </FieldDescription>
              )}
            </FieldSet>
          )}
        />
        {kind === 'fixed' ? (
          minutesInput(
            'minutes',
            t(($) => $.capacity.load_types.fields.minutes),
            minUnit,
          )
        ) : (
          <FieldSet>
            <FieldLegend variant="label">
              {t(($) => $.capacity.load_types.fields.tiers)}
            </FieldLegend>
            <FieldDescription>{t(($) => $.capacity.load_types.fields.tiers_hint)}</FieldDescription>
            <div className="flex flex-col gap-2">
              {tiers.fields.map((tier, i) => {
                const last = i === tiers.fields.length - 1;
                return (
                  <div key={tier.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                    {last ? (
                      <span className="pt-1.5 text-sm text-muted-foreground">
                        {t(($) => $.capacity.load_types.more_units)}
                      </span>
                    ) : (
                      minutesInput(
                        `tiers.${i}.upTo`,
                        t(($) => $.capacity.load_types.fields.up_to, { n: i + 1 }),
                        t(($) => $.capacity.load_types.units),
                        { hideLabel: true, step: 1 },
                      )
                    )}
                    {minutesInput(
                      `tiers.${i}.minutes`,
                      t(($) => $.capacity.load_types.fields.tier_minutes, { n: i + 1 }),
                      minUnit,
                      { hideLabel: true },
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={tiers.fields.length === 1}
                      aria-label={t(($) => $.capacity.load_types.remove_tier, { n: i + 1 })}
                      onClick={() => {
                        tiers.remove(i);
                        if (last) form.setValue(`tiers.${i - 1}.upTo`, null);
                      }}
                    >
                      <XIcon />
                    </Button>
                  </div>
                );
              })}
              <FieldError>{message(form.formState.errors.tiers?.root)}</FieldError>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                disabled={tiers.fields.length >= 10}
                onClick={() => {
                  const rows = form.getValues('tiers');
                  const before = rows.at(-2)?.upTo ?? 0;
                  tiers.insert(rows.length - 1, {
                    upTo: before + 10,
                    minutes: rows.at(-1)?.minutes ?? 60,
                  });
                }}
              >
                <PlusIcon /> {t(($) => $.capacity.load_types.add_tier)}
              </Button>
            </div>
          </FieldSet>
        )}
        {minutesInput(
          'bufferMinutes',
          t(($) => $.capacity.load_types.fields.buffer),
          minUnit,
        )}
        <Controller
          name="resourceIds"
          control={form.control}
          render={({ field }) => (
            <FieldSet>
              <FieldLegend variant="label">
                {t(($) => $.capacity.load_types.fields.resources)}
              </FieldLegend>
              <FieldDescription>
                {t(($) => $.capacity.load_types.fields.resources_hint)}
              </FieldDescription>
              <div className="flex flex-col gap-1.5">
                {resources.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={`lt-resource-${r.id}`}
                      checked={field.value.includes(r.id)}
                      onCheckedChange={(checked) =>
                        field.onChange(
                          checked
                            ? [...field.value, r.id]
                            : field.value.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <label htmlFor={`lt-resource-${r.id}`} className="font-medium">
                      {label(r)}
                    </label>
                    {r.directions.includes(direction) ? null : (
                      <span className="text-xs text-muted-foreground">
                        {t(($) => $.capacity.load_types.wrong_direction)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </FieldSet>
          )}
        />
        {(['carrierBookable', 'active'] as const).map((name) => (
          <Controller
            key={name}
            name={name}
            control={form.control}
            render={({ field }) => (
              <Field orientation="horizontal">
                <Switch id={`lt-${name}`} checked={field.value} onCheckedChange={field.onChange} />
                <FieldLabel htmlFor={`lt-${name}`}>
                  {name === 'active'
                    ? t(($) => $.capacity.load_types.fields.active)
                    : t(($) => $.capacity.load_types.fields.carrier_bookable)}
                </FieldLabel>
              </Field>
            )}
          />
        ))}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : null}
          {t(($) => $.capacity.load_types.save)}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t(($) => $.capacity.closures.cancel)}
        </Button>
      </SheetFooter>
    </form>
  );
}
