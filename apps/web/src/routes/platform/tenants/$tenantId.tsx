import { zodResolver } from '@hookform/resolvers/zod';
import {
  InviteTenantAdmin,
  type TenantDetail,
  UpdateTenant,
} from '@rampflow/shared/modules/core/api.platform';
import { EntitlementSource, PackageId, Permission, values } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeftIcon, MailPlusIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type * as z from 'zod';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { PageHeader } from '@/components/shells/office-shell';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { TableCell } from '@/components/ui/table';
import { guard } from '@/lib/access';
import { api, call } from '@/lib/api';
import {
  groupByModule,
  ModuleGroupTable,
  ToggleAllGroups,
  useModuleGroups,
} from '@/modules/core/entitlement-groups';
import { useEntitlementValue } from '@/modules/core/entitlements';
import { useFormat } from '@/modules/core/format';
import { AddOverrideCard, OverridesCard } from '@/modules/core/overrides';
import { platformKeys, tenantQuery } from '@/modules/core/queries';

// PL-02 and PL-01: one tenant's package, name, entitlements with their source, overrides, and
// pending admin invitations with a re-invite.

export const Route = createFileRoute('/platform/tenants/$tenantId')({
  beforeLoad: guard({ permission: Permission.core.manage_tenants }),
  component: TenantPage,
});

function TenantPage() {
  const { t } = useTranslation();
  const { tenantId } = Route.useParams();
  const tenant = useQuery(tenantQuery(tenantId));
  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/platform/tenants"
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start' })}
      >
        <ArrowLeftIcon /> {t(($) => $.platform.tenant.back)}
      </Link>
      {tenant.data ? <TenantDetailView tenant={tenant.data} /> : <Skeleton className="h-96" />}
    </div>
  );
}

function TenantDetailView({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader
        title={tenant.name}
        description={t(($) => $.platform.tenant.description)}
        actions={<Badge variant="secondary">{t(($) => $.platform.packages[tenant.package])}</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <OverridesCard tenant={tenant} />
          <EntitlementsCard tenant={tenant} />
        </div>
        <div className="flex flex-col gap-4">
          <TenantForm key={`${tenant.name}-${tenant.package}`} tenant={tenant} />
          <AddOverrideCard key={tenant.overrides.length} tenant={tenant} />
          <AdminInvitationsCard tenant={tenant} />
        </div>
      </div>
    </>
  );
}

const TenantFields = UpdateTenant.required();
type TenantFields = z.infer<typeof TenantFields>;

function TenantForm({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const queryClient = useQueryClient();
  const form = useForm<TenantFields>({
    resolver: zodResolver(TenantFields),
    defaultValues: { name: tenant.name, package: tenant.package },
  });
  const save = useMutation({
    mutationFn: (json: TenantFields) =>
      call<TenantDetail>(
        api.platform.tenants[':tenantId'].$patch({ param: { tenantId: tenant.id }, json }),
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(platformKeys.tenant(tenant.id), updated);
      void queryClient.invalidateQueries({ queryKey: platformKeys.tenants(), exact: true });
      toast.success(t(($) => $.platform.tenant.saved));
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t(($) => $.platform.tenant.settings_title)}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((v) => save.mutate(v))}
        >
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
          <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
            {save.isPending ? <Spinner /> : null}
            {t(($) => $.platform.save)}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EntitlementsCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const valueText = useEntitlementValue();
  const sourceText = (source: EntitlementSource) => t(($) => $.platform.sources[source]);
  const groups = groupByModule(tenant.entitlements);
  const state = useModuleGroups(
    'platform.tenant.openModules',
    groups.map((g) => g.module),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t(($) => $.platform.entitlements.title)}</h2>
        </CardTitle>
        <CardDescription>{t(($) => $.platform.entitlements.description)}</CardDescription>
        <CardAction>
          <ToggleAllGroups state={state} />
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <ModuleGroupTable
          groups={groups}
          state={state}
          label={{ header: t(($) => $.platform.columns.entitlement), className: 'pl-6' }}
          columns={[
            {
              id: 'value',
              header: t(($) => $.platform.columns.value),
              isOn: (e) => e.value === true,
            },
            {
              id: 'package_value',
              header: t(($) => $.platform.columns.package_value),
              isOn: (e) => e.packageValue === true,
            },
            { id: 'source', header: t(($) => $.platform.columns.source), className: 'pr-6' },
          ]}
          renderCells={(e) => (
            <>
              <TableCell className="tabular-nums font-semibold">
                {valueText(e.value)}
                {e.soft ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {t(($) => $.platform.soft)}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {valueText(e.packageValue)}
              </TableCell>
              <TableCell className="pr-6">
                <Badge variant={e.source === EntitlementSource.override ? 'default' : 'outline'}>
                  {sourceText(e.source)}
                </Badge>
              </TableCell>
            </>
          )}
        />
      </CardContent>
    </Card>
  );
}

function AdminInvitationsCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const format = useFormat();
  const message = useFieldMessage();
  const queryClient = useQueryClient();
  const form = useForm<InviteTenantAdmin>({
    resolver: zodResolver(InviteTenantAdmin),
    defaultValues: { email: '' },
  });
  const invite = useMutation({
    mutationFn: (json: InviteTenantAdmin) =>
      call(
        api.platform.tenants[':tenantId'].invitations.$post({
          param: { tenantId: tenant.id },
          json,
        }),
      ),
    onSuccess: async (_, v) => {
      await queryClient.invalidateQueries({ queryKey: platformKeys.tenant(tenant.id) });
      toast.success(t(($) => $.platform.invitations.sent, { email: v.email }));
      form.reset();
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t(($) => $.platform.invitations.title)}</h2>
        </CardTitle>
        <CardDescription>{t(($) => $.platform.invitations.description)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {tenant.adminInvitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(($) => $.platform.invitations.empty)}</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {tenant.adminInvitations.map((i) => (
              <li key={i.id} className="flex flex-col rounded-md border px-3 py-2">
                <span className="font-medium">{i.email}</span>
                <span className="text-muted-foreground tabular-nums">
                  {t(($) => $.platform.invitations.expires, { at: format.instant(i.expiresAt) })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((v) => invite.mutate(v))}
        >
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="reinvite-email">
                  {t(($) => $.platform.invitations.email)}
                </FieldLabel>
                <Input
                  {...field}
                  id="reinvite-email"
                  type="email"
                  autoComplete="off"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError>{message(fieldState.error, 'email')}</FieldError>
              </Field>
            )}
          />
          <Button type="submit" variant="outline" disabled={invite.isPending}>
            {invite.isPending ? <Spinner /> : <MailPlusIcon />}
            {t(($) => $.platform.invitations.reinvite)}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
