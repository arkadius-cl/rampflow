import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import type { TenantContext } from '@rampflow/shared/modules/core/api.context';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell/app-shell';
import { NoAccess, RouteError } from '@/components/app-shell/route-states';
import { StationShell } from '@/components/app-shell/station-shell';
import { useSyncLocale } from '@/components/app-shell/user-menu';
import {
  type AreaAccess,
  type AreaRouteContext,
  meQuery,
  requireMe,
  tenantContextQuery,
} from '@/lib/access';
import { isFailure } from '@/lib/api';
import { isStaffLocale } from '@/lib/i18n';

// The tenant area (ADR-0011): one context request per org gates every child route. A 404 (not a
// member, or no such org) renders "no access" without the shell, never a redirect. Screens that
// set `staticData: { shell: 'station' }` get the tablet station layout instead of the sidebar.

export const Route = createFileRoute('/t/$orgId')({
  beforeLoad: async ({ context, params, location }): Promise<AreaRouteContext> => {
    const me = await requireMe(context.queryClient, location.href);
    const tenant = await context.queryClient.ensureQueryData(tenantContextQuery(params.orgId));
    return { me, access: { area: 'tenant', orgId: params.orgId, context: tenant } };
  },
  errorComponent: (props) =>
    isFailure(props.error, 'not_found') ? <NoAccess /> : <RouteError {...props} />,
  component: TenantLayout,
});

/** The tenant's `i18n.default_locale`, for users who never picked a language. */
function tenantLocale(context: TenantContext) {
  const site = context.sites[0];
  const value = site ? context.settings[site.id]?.['i18n.default_locale']?.value : undefined;
  return isStaffLocale(value) ? value : undefined;
}

function TenantLayout() {
  const route = Route.useRouteContext();
  const { orgId } = Route.useParams();
  const me = useQuery(meQuery).data ?? (route.me as MeResponse);
  const context = useQuery(tenantContextQuery(orgId)).data ?? route.access.context;
  const access = { ...route.access, context } as Extract<AreaAccess, { area: 'tenant' }>;
  const station = useMatches({ select: (ms) => ms.at(-1)?.staticData.shell === 'station' });
  useSyncLocale(me, tenantLocale(context as TenantContext));
  if (station) {
    return (
      <StationShell access={access} me={me}>
        <Outlet />
      </StationShell>
    );
  }
  return (
    <AppShell access={access} me={me}>
      <Outlet />
    </AppShell>
  );
}
