import { zodResolver } from '@hookform/resolvers/zod';
import {
  PutResourceDocks,
  type ResourceView,
  UpdateResource,
} from '@rampflow/shared/modules/booking/api.capacity';
import { Direction, ResourceKind } from '@rampflow/shared/modules/booking/values';
import type { DockView } from '@rampflow/shared/modules/core/api.sites';
import { DockStatus } from '@rampflow/shared/modules/core/values';
import { Feature, InputKind, values } from '@rampflow/shared/values';
import { useMutation } from '@tanstack/react-query';
import { LayersIcon, LockIcon, PlusIcon, SquareIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as z from 'zod';
import { applyServerIssues } from '@/components/app-shell/form-errors';
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAccess } from '@/lib/access';
import { api, call } from '@/lib/api';
import { cn } from '@/lib/utils';
import { numberOrNull, useIssueText } from './form';
import { useRefreshMasterData } from './queries';

// MD-03: the editor of the site's bookable resources. A pool has a name, directions, parallel
// slots, a daily cap and member docks; a single dock has the same minus slots and members. Docks
// held by another resource are disabled with its name, the 409 rule shown before it happens.

const ResourceForm = UpdateResource.pick({
  name: true,
  directions: true,
  capacityCap: true,
  dailyCap: true,
  active: true,
})
  .required()
  .extend({ dockIds: z.array(z.string()) });
type ResourceValues = z.infer<typeof ResourceForm>;

const NEW = 'new';

const byCode = (a: DockView, b: DockView) =>
  a.code.localeCompare(b.code, undefined, { numeric: true });

/** Bookable capacity of a pool: its active member docks, at most the cap (ADR-0004). */
const capacityOf = (v: Pick<ResourceValues, 'capacityCap' | 'dockIds'>, docks: DockView[]) => {
  const active = docks.filter(
    (d) => d.status === DockStatus.active && v.dockIds.includes(d.id),
  ).length;
  return v.capacityCap === null ? active : Math.min(active, v.capacityCap);
};

export function ResourceEditor({
  orgId,
  siteId,
  docks,
  resources,
}: {
  orgId: string;
  siteId: string;
  docks: DockView[];
  resources: ResourceView[];
}) {
  const { t } = useTranslation('booking');
  const { has } = useAccess();
  const poolsOn = has(Feature.booking.pools);
  const listed = resources.filter((r) => r.kind === ResourceKind.pool || r.dockIds.length > 0);
  const [selected, setSelected] = useState<string>(() => listed[0]?.id ?? NEW);
  const resource = listed.find((r) => r.id === selected);
  const editing = resource ?? null;
  // Remounts when a dock row moves a dock, so the form never saves a stale member list.
  const formKey = editing ? `${editing.id}:${editing.dockIds.join()}` : NEW;
  const codeOf = (id: string | undefined) => docks.find((d) => d.id === id)?.code ?? '';
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>{t(($) => $.capacity.resources.title)}</CardTitle>
        <CardDescription>{t(($) => $.capacity.resources.description)}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" disabled={!poolsOn} onClick={() => setSelected(NEW)}>
            <PlusIcon /> {t(($) => $.capacity.resources.new_pool)}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {poolsOn ? null : (
          <p
            role="note"
            className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs"
          >
            <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t(($) => $.capacity.resources.pools_off)}
          </p>
        )}
        {listed.length > 0 ? (
          <Field>
            <FieldLabel htmlFor="resource-select">
              {t(($) => $.capacity.resources.select)}
            </FieldLabel>
            <NativeSelect
              id="resource-select"
              className="w-full"
              value={editing ? editing.id : NEW}
              onChange={(e) => setSelected(e.target.value)}
            >
              {poolsOn || !editing ? (
                <NativeSelectOption value={NEW}>
                  {t(($) => $.capacity.resources.new_pool)}
                </NativeSelectOption>
              ) : null}
              {listed.map((r) => (
                <NativeSelectOption key={r.id} value={r.id}>
                  {r.kind === ResourceKind.pool
                    ? t(($) => $.capacity.resources.pool_option, { name: r.name })
                    : t(($) => $.capacity.resources.single_option, { code: codeOf(r.dockIds[0]) })}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        {editing || poolsOn ? (
          <ResourceDetails
            key={formKey}
            orgId={orgId}
            siteId={siteId}
            resource={editing}
            docks={docks}
            resources={resources}
            locked={!poolsOn && editing?.kind !== ResourceKind.single}
            onCreated={setSelected}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResourceDetails({
  orgId,
  siteId,
  resource,
  docks,
  resources,
  locked,
  onCreated,
}: {
  orgId: string;
  siteId: string;
  /** null: a new pool. */
  resource: ResourceView | null;
  docks: DockView[];
  resources: ResourceView[];
  /** Pools without `booking.pools`: shown, not editable. */
  locked: boolean;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation('booking');
  const message = useIssueText();
  const refresh = useRefreshMasterData(orgId);
  const kind = resource?.kind ?? ResourceKind.pool;
  const saved: ResourceValues = {
    name: resource?.name ?? '',
    directions: resource?.directions ?? [Direction.inbound],
    capacityCap: resource?.capacityCap ?? null,
    dailyCap: resource?.dailyCap ?? null,
    active: resource?.active ?? true,
    dockIds: resource?.dockIds ?? [],
  };
  const form = useForm<ResourceValues>({
    resolver: zodResolver(
      kind === ResourceKind.pool
        ? ResourceForm.extend({ dockIds: PutResourceDocks.shape.dockIds })
        : ResourceForm,
    ),
    defaultValues: saved,
  });
  const current = useWatch({ control: form.control }) as ResourceValues;
  const lowered =
    resource !== null &&
    (capacityOf(current, docks) < capacityOf(saved, docks) ||
      (current.dailyCap !== null &&
        (saved.dailyCap === null || current.dailyCap < saved.dailyCap)));

  const save = useMutation({
    mutationFn: async (v: ResourceValues) => {
      const { dockIds, ...fields } = v;
      if (!resource) {
        return call(
          api.t[':orgId'].capacity.resources.$post({
            param: { orgId },
            json: { siteId, kind: ResourceKind.pool, ...fields, dockIds },
          }),
        );
      }
      const param = { orgId, resourceId: resource.id };
      const body = kind === ResourceKind.pool ? fields : { ...fields, capacityCap: undefined };
      const updated = await call(
        api.t[':orgId'].capacity.resources[':resourceId'].$patch({ param, json: body }),
      );
      const changed =
        kind === ResourceKind.pool &&
        (dockIds.length !== resource.dockIds.length ||
          dockIds.some((id) => !resource.dockIds.includes(id)));
      if (!changed) return updated;
      return call(
        api.t[':orgId'].capacity.resources[':resourceId'].docks.$put({ param, json: { dockIds } }),
      );
    },
    onSuccess: async (r) => {
      await refresh();
      toast.success(t(($) => $.capacity.resources.saved, { name: r.name }));
      if (!resource) onCreated(r.id);
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });

  const holderOf = (dockId: string) =>
    resources.find((r) => r.id !== resource?.id && r.dockIds.includes(dockId));

  const number = (
    name: keyof Pick<ResourceValues, 'capacityCap' | 'dailyCap'>,
    label: string,
    unit: string,
    hint: string,
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`resource-${name}`}>{label}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={`resource-${name}`}
              type="number"
              min={1}
              inputMode="numeric"
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(numberOrNull(e.target.value))}
              aria-invalid={fieldState.invalid}
            />
            <InputGroupAddon align="inline-end">{unit}</InputGroupAddon>
          </InputGroup>
          <FieldDescription>{hint}</FieldDescription>
          <FieldError>{message(fieldState.error, InputKind.number)}</FieldError>
        </Field>
      )}
    />
  );

  const KindIcon = kind === ResourceKind.pool ? LayersIcon : SquareIcon;
  return (
    <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))}>
      <fieldset disabled={locked || save.isPending} className="contents">
        <FieldGroup>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <KindIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {kind === ResourceKind.pool
              ? t(($) => $.capacity.resources.pool_explainer)
              : t(($) => $.capacity.resources.single_explainer, {
                  code: docks.find((d) => d.id === resource?.dockIds[0])?.code ?? '',
                })}
          </p>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="resource-name">
                  {t(($) => $.capacity.resources.fields.name)}
                </FieldLabel>
                <Input id="resource-name" {...field} aria-invalid={fieldState.invalid} />
                <FieldError>{message(fieldState.error)}</FieldError>
              </Field>
            )}
          />
          <Controller
            name="directions"
            control={form.control}
            render={({ field, fieldState }) => (
              <FieldSet data-invalid={fieldState.invalid}>
                <FieldLegend variant="label">
                  {t(($) => $.capacity.resources.fields.directions)}
                </FieldLegend>
                <ToggleGroup
                  multiple
                  variant="outline"
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                  aria-label={t(($) => $.capacity.resources.fields.directions)}
                >
                  {values(Direction).map((d) => (
                    <ToggleGroupItem key={d} value={d}>
                      {t(($) => $.capacity.directions[d])}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldError>{message(fieldState.error)}</FieldError>
              </FieldSet>
            )}
          />
          <div className={cn('grid gap-3', kind === ResourceKind.pool && 'grid-cols-2')}>
            {kind === ResourceKind.pool
              ? number(
                  'capacityCap',
                  t(($) => $.capacity.resources.fields.capacity_cap),
                  t(($) => $.capacity.resources.fields.capacity_unit),
                  t(($) => $.capacity.resources.fields.capacity_hint),
                )
              : null}
            {number(
              'dailyCap',
              t(($) => $.capacity.resources.fields.daily_cap),
              t(($) => $.capacity.resources.fields.daily_unit),
              t(($) => $.capacity.resources.fields.daily_hint),
            )}
          </div>
          {lowered ? (
            <div
              role="status"
              className="flex items-start gap-2 rounded-md border border-tone-onsite-border bg-tone-onsite-bg px-3 py-2 text-xs text-tone-onsite"
            >
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t(($) => $.capacity.resources.lowering)}
            </div>
          ) : null}
          {kind === ResourceKind.pool ? (
            <Controller
              name="dockIds"
              control={form.control}
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldLegend variant="label">
                    {t(($) => $.capacity.resources.fields.members)}
                  </FieldLegend>
                  <FieldDescription>
                    {t(($) => $.capacity.resources.fields.members_hint)}
                  </FieldDescription>
                  <div className="flex flex-col gap-1.5">
                    {[...docks].sort(byCode).map((d) => {
                      const elsewhere = holderOf(d.id);
                      return (
                        <div
                          key={d.id}
                          className={cn(
                            'flex items-center gap-2 text-sm',
                            elsewhere && 'text-muted-foreground',
                          )}
                        >
                          <Checkbox
                            id={`member-${d.id}`}
                            checked={field.value.includes(d.id)}
                            disabled={elsewhere !== undefined}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked
                                  ? [...field.value, d.id]
                                  : field.value.filter((id) => id !== d.id),
                              )
                            }
                          />
                          <label htmlFor={`member-${d.id}`} className="font-medium">
                            {d.code}
                          </label>
                          <span className="text-xs text-muted-foreground">
                            {elsewhere
                              ? elsewhere.kind === ResourceKind.pool
                                ? t(($) => $.capacity.resources.in_pool, { name: elsewhere.name })
                                : t(($) => $.capacity.resources.is_single)
                              : d.status === DockStatus.active
                                ? null
                                : t(($) => $.capacity.resources.no_capacity)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <FieldError>
                    {fieldState.error ? t(($) => $.capacity.resources.members_required) : null}
                  </FieldError>
                </FieldSet>
              )}
            />
          ) : null}
          {resource ? (
            <Controller
              name="active"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id="resource-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor="resource-active">
                    {t(($) => $.capacity.resources.fields.active)}
                  </FieldLabel>
                </Field>
              )}
            />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => form.reset(saved)}>
              {t(($) => $.capacity.resources.discard)}
            </Button>
            <Button type="submit" size="sm">
              {save.isPending ? <Spinner /> : null}
              {resource
                ? t(($) => $.capacity.resources.save)
                : t(($) => $.capacity.resources.create)}
            </Button>
          </div>
        </FieldGroup>
      </fieldset>
    </form>
  );
}
