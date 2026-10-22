import type { TenantDetail } from '@rampflow/shared/modules/core/api.platform';
import { TenantStatus } from '@rampflow/shared/modules/core/values';
import { ErrorCode, Permission } from '@rampflow/shared/values';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { ArrowLeftIcon, CirclePauseIcon, CirclePlayIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NoAccess, RouteError } from '@/components/app-shell/route-states';
import { PageHeader } from '@/components/shells/page';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { guard } from '@/lib/access';
import { isFailure } from '@/lib/api';
import { tenantQuery } from '@/modules/core/queries';
import { TenantStatusBadge } from '@/modules/core/tenant-status';
import { TenantSuspensionSheet } from '@/modules/core/tenant-suspension';

// PL-06: the tenant hub, an Objektseite (ADR-0015). The header names the tenant with its status,
// package and the one lifecycle action; the tabs are child routes, the Overview is the index.

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

// The design's underline tabs (surfaces/Tabs.jsx): links, because every tab is its own route.
const tabClass =
  'relative -mb-px inline-flex h-control items-center gap-2 rounded-t-sm border-b-2 border-transparent px-3 text-base font-medium text-muted-foreground outline-none transition-colors duration-150 ease-yrd hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:border-primary aria-[current=page]:text-foreground';

function TenantHub() {
  const { t } = useTranslation();
  const { tenantId } = Route.useParams();
  const tenant = useSuspenseQuery(tenantQuery(tenantId)).data;
  const [suspending, setSuspending] = useState(false);
  const suspended = tenant.status === TenantStatus.suspended;
  const params = { tenantId };
  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/platform/tenants"
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start' })}
      >
        <ArrowLeftIcon /> {t(($) => $.platform.tenant.back)}
      </Link>
      <PageHeader
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
      />
      <nav
        aria-label={t(($) => $.platform.tenant.tabs_label)}
        className="flex flex-wrap gap-1 border-b border-border"
      >
        <Link
          to="/platform/tenants/$tenantId"
          params={params}
          activeOptions={{ exact: true }}
          className={tabClass}
        >
          {t(($) => $.platform.tenant.tabs.overview)}
        </Link>
        <Link to="/platform/tenants/$tenantId/members" params={params} className={tabClass}>
          {t(($) => $.platform.tenant.tabs.members)}
        </Link>
        <Link to="/platform/tenants/$tenantId/sites" params={params} className={tabClass}>
          {t(($) => $.platform.tenant.tabs.sites)}
        </Link>
        <Link to="/platform/tenants/$tenantId/entitlements" params={params} className={tabClass}>
          {t(($) => $.platform.tenant.tabs.entitlements)}
        </Link>
        {/* Change 05 inserts the Billing tab here, between Entitlements and Notes. */}
        <Link to="/platform/tenants/$tenantId/notes" params={params} className={tabClass}>
          {t(($) => $.platform.tenant.tabs.notes)}
        </Link>
      </nav>
      <Outlet />
      <TenantSuspensionSheet tenant={tenant} open={suspending} onOpenChange={setSuspending} />
    </div>
  );
}
