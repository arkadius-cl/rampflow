import type { TenantDetail } from '@rampflow/shared/modules/core/api.platform';
import { TenantStatus } from '@rampflow/shared/modules/core/values';
import { ErrorCode, PageWidth, Permission } from '@rampflow/shared/values';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { CirclePauseIcon, CirclePlayIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NoAccess, RouteError } from '@/components/app-shell/route-states';
import { Page, PageTab, PageTabs } from '@/components/shells/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { guard } from '@/lib/access';
import { isFailure } from '@/lib/api';
import { tenantQuery } from '@/modules/core/queries';
import { TenantStatusBadge } from '@/modules/core/tenant-status';
import { TenantSuspensionSheet } from '@/modules/core/tenant-suspension';

// PL-06: the tenant hub, an Objektseite (ADR-0015, ADR-0022). The header names the tenant with
// its status, package and the one lifecycle action; the tabs are child routes, the Overview is
// the index. The breadcrumb carries the way back to the list.

export const Route = createFileRoute('/platform/tenants/$tenantId')({
  beforeLoad: guard({ permission: Permission.core.manage_tenants }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(tenantQuery(params.tenantId)),
  staticData: { crumb: (match) => (match.loaderData as TenantDetail | undefined)?.name },
  // Here rather than in the platform layout, so "no access" shows inside the shell.
  errorComponent: (props) =>
    isFailure(props.error, ErrorCode.not_found) ? <NoAccess /> : <RouteError {...props} />,
  component: TenantHub,
});

function TenantHub() {
  const { t } = useTranslation();
  const { tenantId } = Route.useParams();
  const tenant = useSuspenseQuery(tenantQuery(tenantId)).data;
  const [suspending, setSuspending] = useState(false);
  const suspended = tenant.status === TenantStatus.suspended;
  return (
    <Page
      width={PageWidth.wide}
      title={tenant.name}
      actions={
        <>
          <TenantStatusBadge status={tenant.status} />
          <Badge variant="secondary">{t(($) => $.platform.packages[tenant.package])}</Badge>
          <Button
            size="sm"
            variant={suspended ? 'default' : 'destructive'}
            onClick={() => setSuspending(true)}
          >
            {suspended ? <CirclePlayIcon /> : <CirclePauseIcon />}
            {suspended
              ? t(($) => $.platform.tenants.reactivate)
              : t(($) => $.platform.tenants.suspend)}
          </Button>
        </>
      }
      tabs={
        <PageTabs label={t(($) => $.platform.tenant.tabs_label)}>
          <PageTab
            to="/platform/tenants/$tenantId"
            params={{ tenantId }}
            activeOptions={{ exact: true }}
          >
            {t(($) => $.platform.tenant.tabs.overview)}
          </PageTab>
          <PageTab to="/platform/tenants/$tenantId/members" params={{ tenantId }}>
            {t(($) => $.platform.tenant.tabs.members)}
          </PageTab>
          <PageTab to="/platform/tenants/$tenantId/sites" params={{ tenantId }}>
            {t(($) => $.platform.tenant.tabs.sites)}
          </PageTab>
          <PageTab to="/platform/tenants/$tenantId/entitlements" params={{ tenantId }}>
            {t(($) => $.platform.tenant.tabs.entitlements)}
          </PageTab>
          {/* Change 05 inserts the Billing tab here, between Entitlements and Notes. */}
          <PageTab to="/platform/tenants/$tenantId/notes" params={{ tenantId }}>
            {t(($) => $.platform.tenant.tabs.notes)}
          </PageTab>
        </PageTabs>
      }
    >
      <Outlet />
      <TenantSuspensionSheet tenant={tenant} open={suspending} onOpenChange={setSuspending} />
    </Page>
  );
}
