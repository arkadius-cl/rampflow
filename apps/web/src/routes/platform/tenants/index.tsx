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
  TenantListParam,
  TenantListView,
  TenantSortKey,
  TenantStatus,
  UsageKey,
} from '@rampflow/shared/modules/core/values';
import { BadgeSize, PackageId, Permission, SheetSize, values } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { createColumnHelper } from '@tanstack/react-table';
import { PlusIcon, XIcon } from 'lucide-react';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { guard } from '@/lib/access';
import { api, call } from '@/lib/api';
import { useCountryName } from '@/modules/carriers/format';
import { useFormat } from '@/modules/core/format';
import { Meter } from '@/modules/core/meter';
import { platformKeys, tenantListQuery, tenantQuery } from '@/modules/core/queries';
import { RelativeTime } from '@/modules/core/relative-time';
import { TenantRowActions } from '@/modules/core/tenant-row-actions';
import {
  InvitedBadge,
  TaxIdStatusBadge,
  TenantFlagBadge,
  TenantStatusBadge,
} from '@/modules/core/tenant-status';
import { type SuspensionTarget, TenantSuspensionSheet } from '@/modules/core/tenant-suspension';

// PL-01, PL-04: the tenant list as an Objektliste (ADR-0015): the views "Needs attention" and
// "All" as tabs with counts, search by name, tax id and admin email, the facets status, package,
// country and flags, sort in the header, paging, all in the URL; usage against limits; the row
// actions menu; "Create tenant" in a sheet.

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

function useColumns(onSuspension: (tenant: SuspensionTarget) => void) {
  const { t } = useTranslation();
  const format = useFormat();
  const countryName = useCountryName();
  const usageLabel = useUsageLabel();
  return useMemo(
    () =>
      column.columns([
        column.accessor(TenantSortKey.name, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.tenants.tenant)} />
          ),
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
              <Link
                to="/platform/tenants/$tenantId"
                params={{ tenantId: row.original.id }}
                className="font-medium underline-offset-4 hover:underline"
              >
                {row.original.name}
              </Link>
              {row.original.possibleDuplicate ? (
                <TenantFlagBadge flag={TenantFlag.possible_duplicate} size={BadgeSize.sm} />
              ) : null}
            </div>
          ),
        }),
        column.accessor(TenantSortKey.status, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.tenants.status)} />
          ),
          cell: ({ row }) => <TenantStatusBadge status={row.original.status} size={BadgeSize.sm} />,
        }),
        column.accessor(TenantSortKey.package, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.tenants.package)} />
          ),
          cell: ({ row }) => (
            <Badge variant="secondary">{t(($) => $.platform.packages[row.original.package])}</Badge>
          ),
        }),
        column.accessor(TenantSortKey.country, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.tenants.country)} />
          ),
          cell: ({ row }) =>
            row.original.country ? (
              <span>
                <span className="font-mono">{row.original.country}</span>{' '}
                <span className="text-muted-foreground">{countryName(row.original.country)}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{t(($) => $.platform.tenants.not_set)}</span>
            ),
        }),
        column.display({
          id: 'taxId',
          header: () => t(($) => $.platform.tenants.tax_id),
          cell: ({ row }) => {
            const { taxId } = row.original;
            if (!taxId) {
              return (
                <span className="text-muted-foreground">
                  {t(($) => $.platform.tenants.no_tax_id)}
                </span>
              );
            }
            return (
              <div className="flex items-center gap-2">
                <span className="font-mono">{taxId.value}</span>
                <TaxIdStatusBadge status={taxId.status} size={BadgeSize.sm} />
              </div>
            );
          },
        }),
        column.display({
          id: 'admin',
          header: () => t(($) => $.platform.tenants.admin),
          cell: ({ row }) => {
            const { admin } = row.original;
            if (!admin) return null;
            return (
              <div className="flex items-center gap-2">
                <span className="max-w-56 truncate" title={admin.email}>
                  {admin.email}
                </span>
                {admin.invited ? <InvitedBadge size={BadgeSize.sm} /> : null}
              </div>
            );
          },
        }),
        column.accessor(TenantSortKey.lastActivityAt, {
          header: ({ column: c }) => (
            <DataTableColumnHeader column={c} title={t(($) => $.platform.tenants.last_activity)} />
          ),
          cell: ({ row }) => (
            <RelativeTime
              iso={row.original.lastActivityAt}
              empty={t(($) => $.platform.tenants.never)}
            />
          ),
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
        column.display({
          id: 'actions',
          header: () => <span className="sr-only">{t(($) => $.platform.tenants.actions)}</span>,
          cell: ({ row }) => <TenantRowActions tenant={row.original} onSuspension={onSuspension} />,
        }),
      ]),
    [t, format, countryName, usageLabel, onSuspension],
  );
}

function TenantsPage() {
  const { t } = useTranslation();
  const navigate = Route.useNavigate();
  const controls = useListState(TenantListQuery, Route.useSearch(), (search, replace) =>
    navigate({ to: '.', search, replace }),
  );
  const { state } = controls;
  const tenants = useQuery(tenantListQuery(state));
  const [suspension, setSuspension] = useState<SuspensionTarget | null>(null);
  const columns = useColumns(setSuspension);
  const countryOptions = useCountryOptions();
  const [creating, setCreating] = useState(false);
  const create = (
    <Button size={BadgeSize.sm} onClick={() => setCreating(true)}>
      <PlusIcon /> {t(($) => $.platform.tenants.create)}
    </Button>
  );
  const views = tenants.data?.views;
  const count = (view: TenantListView) =>
    views ? <ViewCount active={state.view === view} count={views[view]} /> : null;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.platform.tenants.title)}
        description={t(($) => $.platform.tenants.description)}
        actions={create}
      />
      <Tabs
        value={state.view}
        onValueChange={(view) => controls.setParam(TenantListParam.view, view as TenantListView)}
      >
        <TabsList variant="line" aria-label={t(($) => $.platform.tenants.title)}>
          <TabsTrigger value={TenantListView.attention}>
            {t(($) => $.platform.views.attention)}
            {count(TenantListView.attention)}
          </TabsTrigger>
          <TabsTrigger value={TenantListView.all}>
            {t(($) => $.platform.views.all)}
            {count(TenantListView.all)}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable
        controls={controls}
        query={tenants}
        columns={columns}
        facets={{
          status: {
            title: t(($) => $.platform.tenants.status),
            options: values(TenantStatus).map((status) => ({
              value: status,
              label: t(($) => $.platform.tenant_status[status]),
            })),
          },
          package: {
            title: t(($) => $.platform.tenants.package),
            options: values(PackageId).map((id) => ({
              value: id,
              label: t(($) => $.platform.packages[id]),
            })),
          },
          country: {
            title: t(($) => $.platform.tenants.country),
            options: countryOptions,
            hideZero: true,
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
        onRowClick={(tenant) =>
          navigate({ to: '/platform/tenants/$tenantId', params: { tenantId: tenant.id } })
        }
        toolbarExtra={
          state.duplicateOf ? (
            <DuplicateChip
              tenantId={state.duplicateOf}
              onRemove={() => controls.setParam(TenantListParam.duplicateOf, undefined)}
            />
          ) : null
        }
        empty={
          state.view === TenantListView.attention ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t(($) => $.platform.tenants.attention_empty)}</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Link
                  to="."
                  search={TenantListQuery.toSearch({ ...state, view: TenantListView.all, page: 1 })}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  {t(($) => $.platform.tenants.show_all)}
                </Link>
              </EmptyContent>
            </Empty>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t(($) => $.platform.tenants.empty)}</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>{create}</EmptyContent>
            </Empty>
          )
        }
        noMatchTitle={t(($) => $.platform.tenants.no_match)}
      />
      <CreateTenantSheet open={creating} onOpenChange={setCreating} />
      {suspension ? (
        <TenantSuspensionSheet
          tenant={suspension}
          open
          onOpenChange={(open) => (open ? null : setSuspension(null))}
        />
      ) : null}
    </div>
  );
}

/** The count on a view tab, as the design's Tabs.jsx draws it. */
function ViewCount({ active, count }: { active: boolean; count: number }) {
  const format = useFormat();
  return (
    <span
      className={
        active
          ? 'inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-accent px-1 text-xs text-accent-foreground tabular-nums'
          : 'inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-muted px-1 text-xs text-muted-foreground tabular-nums'
      }
    >
      {format.number(count)}
    </span>
  );
}

/** The EU-27 with their names in the viewer's language, then "Not set". */
function useCountryOptions() {
  const { t } = useTranslation();
  const countryName = useCountryName();
  return useMemo(
    () =>
      values(TenantCountryFacet).map((value) => ({
        value,
        label:
          value === TenantCountryFacet.none
            ? t(($) => $.platform.tenants.not_set)
            : `${value} ${countryName(value)}`,
      })),
    [t, countryName],
  );
}

/** The removable chip of the `duplicateOf` filter: "Matching <tenant name>". */
function DuplicateChip({ tenantId, onRemove }: { tenantId: string; onRemove: () => void }) {
  const { t } = useTranslation();
  const tenant = useQuery({ ...tenantQuery(tenantId), meta: { silent: true } });
  const name = tenant.data?.name ?? tenantId;
  return (
    <Badge variant="secondary" className="h-control-sm gap-1 pr-1 pl-2 text-sm">
      {t(($) => $.platform.tenants.matching, { name })}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t(($) => $.platform.tenants.stop_matching, { name })}
        onClick={onRemove}
      >
        <XIcon aria-hidden />
      </Button>
    </Badge>
  );
}

function CreateTenantSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size={SheetSize.md}>
        {open ? <CreateTenantForm onClose={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function CreateTenantForm({ onClose }: { onClose: () => void }) {
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
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={form.handleSubmit((v) => create.mutate(v))}
    >
      <SheetHeader>
        <SheetTitle>{t(($) => $.platform.tenants.create)}</SheetTitle>
        <SheetDescription>{t(($) => $.platform.tenants.create_description)}</SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-auto px-pad py-4">
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
      </div>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t(($) => $.platform.cancel)}
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Spinner /> : null}
          {t(($) => $.platform.tenants.create_submit)}
        </Button>
      </SheetFooter>
    </form>
  );
}
