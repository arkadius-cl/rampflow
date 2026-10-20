import { zodResolver } from '@hookform/resolvers/zod';
import {
  type EntitlementView,
  type OverrideView,
  PutOverride,
  type TenantDetail,
} from '@rampflow/shared/modules/core/api.platform';
import { EntitlementKind } from '@rampflow/shared/values';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as z from 'zod';
import { applyServerIssues } from '@/components/app-shell/form-errors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, call } from '@/lib/api';
import { rank, useEntitlementLabel, useEntitlementValue } from './entitlements';
import { useFormat } from './format';
import { platformKeys } from './queries';

// PL-02: per-tenant overrides. An override beats the package in both directions, applies on the
// next request and lapses at its expiry.

function useRefreshTenant(tenantId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: platformKeys.tenant(tenantId) }),
      queryClient.invalidateQueries({ queryKey: platformKeys.tenantLists() }),
    ]);
}

export function OverridesCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const format = useFormat();
  const label = useEntitlementLabel();
  const valueText = useEntitlementValue();
  const refresh = useRefreshTenant(tenant.id);
  const remove = useMutation({
    mutationFn: (key: string) =>
      call(
        api.platform.tenants[':tenantId'].overrides[':key'].$delete({
          param: { tenantId: tenant.id, key },
        }),
      ),
    onSuccess: async () => {
      await refresh();
      toast.success(t(($) => $.platform.overrides.removed));
    },
  });
  const byKey = new Map(tenant.entitlements.map((e) => [e.key, e]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t(($) => $.platform.overrides.title)}</h2>
        </CardTitle>
        <CardDescription>{t(($) => $.platform.overrides.description)}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {tenant.overrides.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">
            {t(($) => $.platform.overrides.empty)}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{t(($) => $.platform.columns.entitlement)}</TableHead>
                <TableHead>{t(($) => $.platform.columns.package_value)}</TableHead>
                <TableHead>{t(($) => $.platform.columns.override)}</TableHead>
                <TableHead>{t(($) => $.platform.columns.expires)}</TableHead>
                <TableHead>{t(($) => $.platform.columns.note)}</TableHead>
                <TableHead className="pr-6">
                  <span className="sr-only">{t(($) => $.platform.columns.actions)}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenant.overrides.map((o) => (
                <OverrideRow
                  key={o.key}
                  override={o}
                  entitlement={byKey.get(o.key)}
                  label={label(o.key)}
                  valueText={valueText}
                  expires={o.expiresAt ? format.instant(o.expiresAt) : null}
                  removing={remove.isPending}
                  onRemove={() => remove.mutate(o.key)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function OverrideRow({
  override: o,
  entitlement,
  label,
  valueText,
  expires,
  removing,
  onRemove,
}: {
  override: OverrideView;
  entitlement: EntitlementView | undefined;
  label: string;
  valueText: ReturnType<typeof useEntitlementValue>;
  expires: string | null;
  removing: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const direction = rank(o.value) < rank(entitlement?.packageValue) ? 'lower' : 'higher';
  return (
    <TableRow data-testid={`override-${o.key}`}>
      <TableCell className="pl-6">
        <div className="font-medium">{label}</div>
        <code className="text-xs text-muted-foreground">{o.key}</code>
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {valueText(entitlement?.packageValue)}
      </TableCell>
      <TableCell className="tabular-nums">
        <span className="font-semibold">{valueText(o.value)}</span>
        <span className="ml-1 text-xs text-muted-foreground">
          {t(($) => $.platform.overrides[direction])}
          {entitlement?.soft ? ` · ${t(($) => $.platform.soft)}` : ''}
        </span>
      </TableCell>
      <TableCell className="tabular-nums">
        {expires ? (
          <span className="inline-flex items-center gap-1">
            <CalendarIcon className="size-3.5 text-muted-foreground" aria-hidden /> {expires}
          </span>
        ) : (
          <span className="text-muted-foreground">{t(($) => $.platform.overrides.never)}</span>
        )}
        {o.active ? null : (
          <Badge variant="outline" className="ml-2">
            {t(($) => $.platform.overrides.lapsed)}
          </Badge>
        )}
      </TableCell>
      <TableCell className="max-w-48 text-sm text-muted-foreground">{o.note}</TableCell>
      <TableCell className="pr-6 text-right">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={removing}
          aria-label={t(($) => $.platform.overrides.remove, { key: o.key })}
          onClick={onRemove}
        >
          <TrashIcon />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// `value` holds 'true' or 'false' for features and digits for limits, so one control set fits
// both kinds; it becomes PutOverride's value on submit.
const OverrideForm = z
  .object({
    key: z.string().min(1),
    value: z.string(),
    unlimited: z.boolean(),
    expiresAt: z.string(),
    note: PutOverride.shape.note,
  })
  .refine((v) => v.unlimited || /^(true|false|\d+)$/.test(v.value), {
    path: ['value'],
    message: 'whole_number',
  });
type OverrideForm = z.input<typeof OverrideForm>;

export function AddOverrideCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const label = useEntitlementLabel();
  const refresh = useRefreshTenant(tenant.id);
  const first = tenant.entitlements[0];
  const startValue = (e: EntitlementView | undefined): Pick<OverrideForm, 'value' | 'unlimited'> =>
    e?.kind === EntitlementKind.feature
      ? { value: String(e.value !== true), unlimited: false }
      : {
          value: typeof e?.value === 'number' ? String(e.value) : '',
          unlimited: e?.value === null,
        };
  const form = useForm<OverrideForm>({
    resolver: zodResolver(OverrideForm),
    defaultValues: { key: first?.key ?? '', ...startValue(first), expiresAt: '', note: '' },
  });
  const key = form.watch('key');
  const unlimited = form.watch('unlimited');
  const entitlement = tenant.entitlements.find((e) => e.key === key);
  const put = useMutation({
    mutationFn: (v: OverrideForm) =>
      call<OverrideView>(
        api.platform.tenants[':tenantId'].overrides[':key'].$put({
          param: { tenantId: tenant.id, key: v.key },
          json: {
            value:
              entitlement?.kind === EntitlementKind.feature
                ? v.value === String(true)
                : v.unlimited
                  ? null
                  : Number(v.value),
            expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
            note: v.note?.trim() ? v.note.trim() : null,
          },
        }),
      ),
    onSuccess: async () => {
      await refresh();
      toast.success(t(($) => $.platform.overrides.saved));
      form.reset({ ...form.getValues(), expiresAt: '', note: '' });
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t(($) => $.platform.overrides.add_title)}</h2>
        </CardTitle>
        <CardDescription>{t(($) => $.platform.overrides.add_description)}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((v) => put.mutate(v))}
        >
          <Controller
            name="key"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="override-key">{t(($) => $.platform.overrides.key)}</FieldLabel>
                <NativeSelect
                  id="override-key"
                  className="w-full"
                  value={field.value}
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    const next = startValue(
                      tenant.entitlements.find((x) => x.key === e.target.value),
                    );
                    form.setValue('value', next.value);
                    form.setValue('unlimited', next.unlimited);
                  }}
                >
                  {tenant.entitlements.map((e) => (
                    <NativeSelectOption key={e.key} value={e.key}>
                      {label(e.key)} ({e.key})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>{t(($) => $.platform.overrides.reserved_hint)}</FieldDescription>
              </Field>
            )}
          />
          {entitlement?.kind === EntitlementKind.feature ? (
            <Controller
              name="value"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="override-value">
                    {t(($) => $.platform.overrides.value)}
                  </FieldLabel>
                  <NativeSelect {...field} id="override-value" className="w-full">
                    <NativeSelectOption value="true">
                      {t(($) => $.platform.values.on)}
                    </NativeSelectOption>
                    <NativeSelectOption value="false">
                      {t(($) => $.platform.values.off)}
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              )}
            />
          ) : (
            <Controller
              name="value"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="override-value">
                    {t(($) => $.platform.overrides.value)}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="override-value"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    disabled={unlimited}
                    aria-invalid={fieldState.invalid}
                    className="tabular-nums"
                  />
                  <Controller
                    name="unlimited"
                    control={form.control}
                    render={({ field: u }) => (
                      <Field orientation="horizontal">
                        <Checkbox
                          id="override-unlimited"
                          checked={u.value}
                          onCheckedChange={(on) => u.onChange(on)}
                        />
                        <FieldLabel htmlFor="override-unlimited" className="font-normal">
                          {t(($) => $.platform.unlimited_option)}
                        </FieldLabel>
                      </Field>
                    )}
                  />
                  <FieldError>
                    {fieldState.error ? t(($) => $.platform.overrides.whole_number) : null}
                  </FieldError>
                </Field>
              )}
            />
          )}
          <Controller
            name="expiresAt"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="override-expires">
                  {t(($) => $.platform.overrides.expires)}
                </FieldLabel>
                <Input {...field} id="override-expires" type="datetime-local" />
                <FieldDescription>{t(($) => $.platform.overrides.expires_hint)}</FieldDescription>
                <FieldError>
                  {fieldState.error ? t(($) => $.platform.overrides.invalid) : null}
                </FieldError>
              </Field>
            )}
          />
          <Controller
            name="note"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="override-note">
                  {t(($) => $.platform.overrides.note)}
                </FieldLabel>
                <Input {...field} value={field.value ?? ''} id="override-note" maxLength={500} />
                <FieldError>
                  {fieldState.error ? t(($) => $.platform.overrides.invalid) : null}
                </FieldError>
              </Field>
            )}
          />
          <Button type="submit" disabled={put.isPending}>
            {put.isPending ? <Spinner /> : <PlusIcon />}
            {t(($) => $.platform.overrides.add)}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
