import { zodResolver } from '@hookform/resolvers/zod';
import { InviteTenantAdmin, type TenantDetail } from '@rampflow/shared/modules/core/api.platform';
import { EntitlementSource, UiPref } from '@rampflow/shared/values';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { MailPlusIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { TableCell } from '@/components/ui/table';
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

// PL-02: the Entitlements tab of the tenant hub (PL-06): the overrides with the add form, the
// grouped entitlements with their source, and the pending admin invitations with a re-invite.
// Moved unchanged from the single detail page of 01; the master data form lives on the Overview.

export const Route = createFileRoute('/platform/tenants/$tenantId/entitlements')({
  component: EntitlementsTab,
});

function EntitlementsTab() {
  const { tenantId } = Route.useParams();
  const tenant = useSuspenseQuery(tenantQuery(tenantId)).data;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <OverridesCard tenant={tenant} />
        <EntitlementsCard tenant={tenant} />
      </div>
      <div className="flex flex-col gap-4">
        <AddOverrideCard key={tenant.overrides.length} tenant={tenant} />
        <AdminInvitationsCard tenant={tenant} />
      </div>
    </div>
  );
}

function EntitlementsCard({ tenant }: { tenant: TenantDetail }) {
  const { t } = useTranslation();
  const valueText = useEntitlementValue();
  const sourceText = (source: EntitlementSource) => t(($) => $.platform.sources[source]);
  const groups = groupByModule(tenant.entitlements);
  const state = useModuleGroups(
    UiPref.platform_tenant_open_modules,
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
