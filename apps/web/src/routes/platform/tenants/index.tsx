import { zodResolver } from '@hookform/resolvers/zod';
import { PACKAGE_IDS } from '@rampflow/shared';
import {
  CreateTenant,
  type TenantDetail,
  USAGE_KEYS,
  type UsageKey,
} from '@rampflow/shared/modules/core/api.platform';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { guard } from '@/lib/access';
import { api, call } from '@/lib/api';
import { Meter } from '@/modules/core/meter';
import { platformKeys, tenantsQuery } from '@/modules/core/queries';

// PL-01, PL-04: tenants with usage against their limits, and "Create tenant".

export const Route = createFileRoute('/platform/tenants/')({
  beforeLoad: guard({ permission: 'core.manage_tenants' }),
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

function TenantsPage() {
  const { t } = useTranslation();
  const tenants = useQuery(tenantsQuery);
  const usageLabel = useUsageLabel();
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.platform.tenants.title)}
        description={t(($) => $.platform.tenants.description)}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusIcon /> {t(($) => $.platform.tenants.create)}
          </Button>
        }
      />
      {tenants.data ? (
        <div className="overflow-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(($) => $.platform.tenants.tenant)}</TableHead>
                <TableHead>{t(($) => $.platform.tenants.package)}</TableHead>
                {USAGE_KEYS.map((key) => (
                  <TableHead key={key}>{usageLabel(key)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.data.items.map((tenant) => (
                <TableRow key={tenant.id} data-testid={`tenant-${tenant.id}`}>
                  <TableCell className="font-medium">
                    <Link
                      to="/platform/tenants/$tenantId"
                      params={{ tenantId: tenant.id }}
                      className="underline-offset-4 hover:underline"
                    >
                      {tenant.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {t(($) => $.platform.packages[tenant.package])}
                    </Badge>
                  </TableCell>
                  {USAGE_KEYS.map((key) => (
                    <TableCell key={key}>
                      <Meter meter={tenant.usage[key]} label={usageLabel(key)} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {tenants.data.items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {t(($) => $.platform.tenants.empty)}
            </p>
          ) : null}
        </div>
      ) : (
        <Skeleton className="h-48" />
      )}
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
    defaultValues: { name: '', package: 'start', adminEmail: '' },
  });
  const create = useMutation({
    mutationFn: (json: CreateTenant) => call<TenantDetail>(api.platform.tenants.$post({ json })),
    onSuccess: async (tenant) => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.tenants() });
      queryClient.setQueryData(platformKeys.tenant(tenant.id), tenant);
      toast.success(t(($) => $.platform.tenants.created, { name: tenant.name }));
      onClose();
      await navigate({ to: '/platform/tenants/$tenantId', params: { tenantId: tenant.id } });
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
                    {PACKAGE_IDS.map((id) => (
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
