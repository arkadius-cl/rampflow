import { zodResolver } from '@hookform/resolvers/zod';
import {
  type TenantDetail,
  TenantListQuery,
  UpdateTenant,
} from '@rampflow/shared/modules/core/api.platform';
import {
  EuCountry,
  TaxIdStatus,
  TenantFlag,
  TenantListView,
  UsageKey,
} from '@rampflow/shared/modules/core/values';
import { ConflictReason, ErrorCode, PackageId, values } from '@rampflow/shared/values';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleCheckIcon, CircleIcon, PencilIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type * as z from 'zod';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { api, call, isFailure } from '@/lib/api';
import { useCountryName } from '@/modules/carriers/format';
import { useFormat } from './format';
import { Meter } from './meter';
import { platformKeys, tenantQuery } from './queries';
import { RelativeTime } from './relative-time';
import { TaxIdStatusBadge, TenantFlagBadge, TenantStatusBadge } from './tenant-status';

// PL-06: the Overview tab. Cards for the lifecycle, the onboarding progress, the usage, the tax
// id, the flags, the admins and the details; the master data card edits in place (design system,
// "Where a form goes"). Platform times belong to no site, so they show in the viewer's zone.

export function TenantOverview({ tenantId }: { tenantId: string }) {
  const tenant = useSuspenseQuery(tenantQuery(tenantId)).data;
  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <StatusCard tenant={tenant} />
      <OnboardingCard tenant={tenant} />
      <UsageCard tenant={tenant} />
      <TaxIdCard tenant={tenant} />
      <FlagsCard tenant={tenant} />
      <AdminsCard tenant={tenant} />
      <DetailsCard tenant={tenant} />
      <MasterDataCard key={`${tenant.name}-${tenant.package}-${tenant.country}`} tenant={tenant} />
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">{children}</CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function StatusCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { suspension } = tenant;
  return (
    <Section title={t(($) => $.platform.overview.status_title)}>
      <TenantStatusBadge status={tenant.status} className="self-start" />
      {suspension ? (
        <dl className="flex flex-col gap-3">
          <Row
            label={t(($) => $.platform.overview.suspended_at, {
              at: format.instant(suspension.at),
            })}
          >
            {suspension.by
              ? t(($) => $.platform.overview.suspended_by, { name: suspension.by.name })
              : null}
          </Row>
          <Row label={t(($) => $.platform.overview.reason)}>
            <span className="whitespace-pre-wrap">{suspension.reason}</span>
          </Row>
        </dl>
      ) : null}
    </Section>
  );
}

function OnboardingCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { onboarding } = tenant;
  return (
    <Section title={t(($) => $.platform.overview.onboarding_title)}>
      {onboarding ? (
        <>
          <p className="tabular-nums">
            {t(($) => $.platform.overview.steps, {
              done: onboarding.steps.filter((s) => s.done).length,
              total: onboarding.steps.length,
            })}
          </p>
          <ol className="flex flex-col gap-1">
            {onboarding.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2">
                {step.done ? (
                  <CircleCheckIcon className="size-4 text-tone-success" aria-hidden />
                ) : (
                  <CircleIcon className="size-4 text-muted-foreground" aria-hidden />
                )}
                <span className={step.done ? 'text-muted-foreground' : undefined}>
                  {t(($) => $.onboarding.steps[step.id].title)}
                </span>
                <span className="sr-only">
                  {step.done
                    ? t(($) => $.onboarding.state.done)
                    : t(($) => $.onboarding.state.open)}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : tenant.activatedAt ? (
        <p className="tabular-nums">
          {t(($) => $.platform.overview.activated, { at: format.instant(tenant.activatedAt) })}
        </p>
      ) : null}
    </Section>
  );
}

function UsageCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const labels: Record<UsageKey, string> = {
    'core.max_sites': t(($) => $.platform.usage.sites),
    'core.max_docks': t(($) => $.platform.usage.docks),
    'core.max_internal_users': t(($) => $.platform.usage.users),
    'booking.max_bookings_per_month': t(($) => $.platform.usage.bookings),
  };
  return (
    <Section title={t(($) => $.platform.overview.usage_title)}>
      <dl className="flex flex-col gap-3">
        {values(UsageKey).map((key) => (
          <Row key={key} label={labels[key]}>
            <Meter meter={tenant.usage[key]} label={labels[key]} />
          </Row>
        ))}
      </dl>
    </Section>
  );
}

function TaxIdCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { taxId } = tenant;
  return (
    <Section title={t(($) => $.platform.overview.tax_id_title)}>
      {taxId ? (
        <dl className="flex flex-col gap-3">
          <Row label={t(($) => $.platform.overview.tax_id_type)}>
            {t(($) => $.signup.form.tax_id_types[taxId.type])}
          </Row>
          <Row label={t(($) => $.platform.overview.tax_id_value)}>
            <span className="font-mono">{taxId.value}</span>
          </Row>
          <Row
            label={
              taxId.checkedAt
                ? t(($) => $.platform.overview.tax_id_checked, {
                    at: format.instant(taxId.checkedAt),
                  })
                : t(($) => $.platform.overview.tax_id_unchecked)
            }
          >
            <TaxIdStatusBadge status={taxId.status} />
          </Row>
        </dl>
      ) : (
        <p className="text-muted-foreground">{t(($) => $.platform.overview.tax_id_none)}</p>
      )}
    </Section>
  );
}

function FlagsCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const flags = [
    ...(tenant.possibleDuplicate ? [TenantFlag.possible_duplicate] : []),
    ...(tenant.taxId?.status === TaxIdStatus.unverified ? [TenantFlag.tax_id_unverified] : []),
  ];
  return (
    <Section title={t(($) => $.platform.overview.flags_title)}>
      {flags.length === 0 ? (
        <p className="text-muted-foreground">{t(($) => $.platform.overview.flags_none)}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {flags.map((flag) => (
            <TenantFlagBadge key={flag} flag={flag} />
          ))}
        </div>
      )}
      {tenant.possibleDuplicate ? (
        <Link
          to="/platform/tenants"
          search={TenantListQuery.toSearch({
            ...TenantListQuery.defaults,
            view: TenantListView.all,
            duplicateOf: tenant.id,
          })}
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'self-start' })}
        >
          {t(($) => $.platform.overview.show_matching)}
        </Link>
      ) : null}
    </Section>
  );
}

function AdminsCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <Section title={t(($) => $.platform.overview.admins_title)}>
      {tenant.admins.length === 0 && tenant.adminInvitations.length === 0 ? (
        <p className="text-muted-foreground">{t(($) => $.platform.overview.admins_none)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tenant.admins.map((admin) => (
            <li key={admin.id} className="flex flex-col">
              <span className="font-medium">{admin.name}</span>
              <span className="text-muted-foreground">{admin.email}</span>
            </li>
          ))}
          {tenant.adminInvitations.map((invitation) => (
            <li key={invitation.id} className="flex flex-col">
              <span className="font-medium">{invitation.email}</span>
              <span className="text-muted-foreground tabular-nums">
                {t(($) => $.platform.overview.invitation_open, {
                  at: format.instant(invitation.expiresAt),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function DetailsCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const format = useFormat();
  const countryName = useCountryName();
  return (
    <Section title={t(($) => $.platform.overview.details_title)}>
      <dl className="flex flex-col gap-3">
        <Row label={t(($) => $.platform.overview.country)}>
          {tenant.country ? (
            <>
              <span className="font-mono">{tenant.country}</span> {countryName(tenant.country)}
            </>
          ) : (
            <span className="text-muted-foreground">{t(($) => $.platform.tenants.not_set)}</span>
          )}
        </Row>
        <Row label={t(($) => $.platform.overview.created)}>{format.instant(tenant.createdAt)}</Row>
        <Row label={t(($) => $.platform.overview.last_activity)}>
          <RelativeTime iso={tenant.lastActivityAt} empty={t(($) => $.platform.tenants.never)} />
        </Row>
      </dl>
    </Section>
  );
}

const TenantFields = UpdateTenant.required();
type TenantFields = z.infer<typeof TenantFields>;

/** `NativeSelect` has no null: '' stands for "not set" and becomes `null` on save. */
const NO_COUNTRY = '';

function MasterDataCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const countryName = useCountryName();
  const title = t(($) => $.platform.tenant.settings_title);
  if (!editing) {
    return (
      <Section
        title={title}
        action={
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon /> {t(($) => $.platform.tenant.edit)}
          </Button>
        }
      >
        <dl className="flex flex-col gap-3">
          <Row label={t(($) => $.platform.tenants.name)}>{tenant.name}</Row>
          <Row label={t(($) => $.platform.tenants.country)}>
            {tenant.country ? (
              `${tenant.country} ${countryName(tenant.country)}`
            ) : (
              <span className="text-muted-foreground">{t(($) => $.platform.tenants.not_set)}</span>
            )}
          </Row>
          <Row label={t(($) => $.platform.tenants.package)}>
            {t(($) => $.platform.packages[tenant.package])}
          </Row>
        </dl>
      </Section>
    );
  }
  return <MasterDataForm tenant={tenant} title={title} onClose={() => setEditing(false)} />;
}

function MasterDataForm({
  tenant,
  title,
  onClose,
}: {
  tenant: TenantDetail;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const countryName = useCountryName();
  const queryClient = useQueryClient();
  const form = useForm<TenantFields>({
    resolver: zodResolver(TenantFields),
    defaultValues: {
      name: tenant.name,
      package: tenant.package,
      country: tenant.country as EuCountry | null,
    },
  });
  const save = useMutation({
    mutationFn: (json: TenantFields) =>
      call<TenantDetail>(
        api.platform.tenants[':tenantId'].$patch({ param: { tenantId: tenant.id }, json }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(platformKeys.tenant(tenant.id), updated);
      void queryClient.invalidateQueries({ queryKey: platformKeys.tenantLists() });
      toast.success(t(($) => $.platform.tenant.saved));
      onClose();
    },
    onError: (e) => {
      if (applyServerIssues(e, form.setError)) return;
      if (isFailure(e, ErrorCode.conflict) && e.conflictReason === ConflictReason.tax_id_country) {
        form.setError('country', { message: t(($) => $.errors.conflict.tax_id_country) });
      }
    },
    // The 409 shows at the field, so the global toast would repeat it.
    meta: { silent: true },
  });
  return (
    <Card>
      <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="contents">
        <CardHeader>
          <CardTitle>
            <h2>{title}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="tenant-name">{t(($) => $.platform.tenants.name)}</FieldLabel>
                <Input {...field} id="tenant-name" aria-invalid={fieldState.invalid} />
                <FieldError>{message(fieldState.error)}</FieldError>
              </Field>
            )}
          />
          <Controller
            name="country"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="tenant-country">
                  {t(($) => $.platform.tenants.country)}
                </FieldLabel>
                <NativeSelect
                  id="tenant-country"
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                  value={field.value ?? NO_COUNTRY}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === NO_COUNTRY ? null : (e.target.value as EuCountry),
                    )
                  }
                >
                  <NativeSelectOption value={NO_COUNTRY}>
                    {t(($) => $.platform.tenants.not_set)}
                  </NativeSelectOption>
                  {values(EuCountry).map((code) => (
                    <NativeSelectOption key={code} value={code}>
                      {code} {countryName(code)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError>{fieldState.error?.message || message(fieldState.error)}</FieldError>
              </Field>
            )}
          />
          <Controller
            name="package"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="tenant-package">
                  {t(($) => $.platform.tenants.package)}
                </FieldLabel>
                <NativeSelect
                  id="tenant-package"
                  className="w-full"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value as PackageId)}
                >
                  {values(PackageId).map((id) => (
                    <NativeSelectOption key={id} value={id}>
                      {t(($) => $.platform.packages[id])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          />
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t(($) => $.platform.cancel)}
          </Button>
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? <Spinner /> : null}
            {t(($) => $.platform.save)}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
