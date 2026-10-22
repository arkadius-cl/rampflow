import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateTenant,
  type TenantDetail,
  TenantListQuery,
  type TenantSummary,
} from '@rampflow/shared/modules/core/api.platform';
import {
  TenantCountryFacet,
  TenantFlag,
  TenantSortKey,
  TenantStatus,
  UsageKey,
} from '@rampflow/shared/modules/core/values';
import { PackageId, Permission, values } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { DataTable, type dataTableFeatures } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { canonicalSearch, useListState } from '@/components/data-table/use-list-state';
import { PageHeader } from '@/components/shells/office-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { guard } from '@/lib/access';
import { api, call } from '@/lib/api';
import { useFormat } from '@/modules/core/format';
import { Meter } from '@/modules/core/meter';
import { platformKeys, tenantListQuery } from '@/modules/core/queries';
import { TenantStatusBadge } from '@/modules/core/tenant-status';

// PL-01, PL-04: the tenant list with search by name, the package and status filters, sort by
// name or creation and paging, all in the URL (ADR-0015); usage against limits; "Create tenant".

export const Route = createFileRoute('/platform/tenants/')({
  beforeLoad: guard({ permission: Permission.core.manage_tenants }),
  validateSearch: TenantListQuery.search,
  search: { middlewares: [canonicalSearch(TenantListQuery)] },
  component: TenantsPage,
});

function useUsageLabel() {
  const { t } = useTranslation();
  const labels: Record<UsageKey, string> = {
    'core.max_sites': t(($) => $.platform.usage.sites),
    'core.max_docks': t(($) => $.platform.usage.docks),
    'core.max_internal_users': t(($) => $.platform.usage.users),
    'booking.max_bookings_per_month': t(($) => $.platform.usage.bookings),
  };
  return (key: UsageKey) => labels[key];
}

const column = createColumnHelper<typeof dataTableFeatures, TenantSummary>();

function useColumns() {
  const { t } = useTranslation();
  const format = useFormat();
  const usageLabel = useUsageLabel();
  return useMemo(
    () =>
      column.columns([
        column.accessor(TenantSortKey.name, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.tenants.tenant)} />
          ),
          cell: ({ row }) => (
            <Link
              to="/platform/tenants/$tenantId"
              params={{ tenantId: row.original.id }}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.original.name}
            </Link>
          ),
        }),
        column.accessor('package', {
          header: () => t(($) => $.platform.tenants.package),
          cell: ({ row }) => (
            <Badge variant="secondary">{t(($) => $.platform.packages[row.original.package])}</Badge>
          ),
        }),
        column.accessor('status', {
          header: () => t(($) => $.platform.tenants.status),
          cell: ({ row }) => <TenantStatusBadge status={row.original.status} />,
        }),
        column.accessor(TenantSortKey.createdAt, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.tenants.created_at)} />
          ),
          cell: ({ row }) => (
            <span className="whitespace-nowrap tabular-nums">
              {format.instant(row.original.createdAt)}
            </span>
          ),
        }),
        ...values(UsageKey).map((key) =>
          column.display({
            id: key,
            header: () => usageLabel(key),
            cell: ({ row }) => <Meter meter={row.original.usage[key]} label={usageLabel(key)} />,
          }),
        ),
      ]),
    [t, format, usageLabel],
  );
}

function TenantsPage() {
  const { t } = useTranslation();
  const navigate = Route.useNavigate();
  const controls = useListState(TenantListQuery, Route.useSearch(), (search, replace) =>
    navigate({ to: '.', search, replace }),
  );
  const tenants = useQuery(tenantListQuery(controls.state));
  const columns = useColumns();
  const [creating, setCreating] = useState(false);
  const create = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <PlusIcon /> {t(($) => $.platform.tenants.create)}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.platform.tenants.title)}
        description={t(($) => $.platform.tenants.description)}
        actions={create}
      />
      <DataTable
        controls={controls}
        query={tenants}
        columns={columns}
        facets={{
          package: {
            title: t(($) => $.platform.tenants.package),
            options: values(PackageId).map((id) => ({
              value: id,
              label: t(($) => $.platform.packages[id]),
            })),
          },
          status: {
            title: t(($) => $.platform.tenants.status),
            options: values(TenantStatus).map((status) => ({
              value: status,
              label: t(($) => $.platform.tenant_status[status]),
            })),
          },
          // TODO(04 web agent, task 4.1): translated country names, "Not set", zero counts hidden.
          country: {
            title: t(($) => $.platform.tenants.country),
            options: values(TenantCountryFacet).map((value) => ({ value, label: value })),
          },
          flag: {
            title: t(($) => $.platform.tenants.flags),
            options: values(TenantFlag).map((value) => ({
              value,
              label: t(($) => $.platform.tenant_flag[value]),
            })),
          },
        }}
        label={t(($) => $.platform.tenants.title)}
        searchPlaceholder={t(($) => $.platform.tenants.search)}
        getRowId={(tenant) => tenant.id}
        rowTestId={(tenant) => `tenant-${tenant.id}`}
        empty={
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t(($) => $.platform.tenants.empty)}</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>{create}</EmptyContent>
          </Empty>
        }
        noMatchTitle={t(($) => $.platform.tenants.no_match)}
      />
      <CreateTenantDialog
        key={String(creating)}
        open={creating}
        onClose={() => setCreating(false)}
      />
    </div>
  );
}

function CreateTenantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<CreateTenant>({
    resolver: zodResolver(CreateTenant),
    defaultValues: { name: '', package: PackageId.start, adminEmail: '' },
  });
  const create = useMutation({
    mutationFn: (json: CreateTenant) => call<TenantDetail>(api.platform.tenants.$post({ json })),
    onSuccess: async (tenant) => {
      queryClient.setQueryData(platformKeys.tenant(tenant.id), tenant);
      toast.success(t(($) => $.platform.tenants.created, { name: tenant.name }));
      await navigate({ to: '/platform/tenants/$tenantId', params: { tenantId: tenant.id } });
      void queryClient.invalidateQueries({ queryKey: platformKeys.tenantLists() });
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <DialogHeader className="mb-4">
            <DialogTitle>{t(($) => $.platform.tenants.create)}</DialogTitle>
            <DialogDescription>{t(($) => $.platform.tenants.create_description)}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
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
                  <NativeSelect {...field} id="tenant-package" className="w-full">
                    {values(PackageId).map((id) => (
                      <NativeSelectOption key={id} value={id}>
                        {t(($) => $.platform.packages[id])}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            />
            <Controller
              name="adminEmail"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="tenant-admin-email">
                    {t(($) => $.platform.tenants.admin_email)}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="tenant-admin-email"
                    type="email"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError>{message(fieldState.error, 'email')}</FieldError>
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              {t(($) => $.platform.cancel)}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : null}
              {t(($) => $.platform.tenants.create_submit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
