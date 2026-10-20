import { ErrorCode, OrgKind } from '@rampflow/shared/values';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell/app-shell';
import { NoAccess, RouteError } from '@/components/app-shell/route-states';
import { useSyncLocale } from '@/components/app-shell/user-menu';
import { type AreaRouteContext, meQuery, platformContextQuery, requireMe } from '@/lib/access';
import { isFailure } from '@/lib/api';

// The platform area (ADR-0011): platform admins only; everyone else gets "no access".

export const Route = createFileRoute('/platform')({
  beforeLoad: async ({ context, location }): Promise<AreaRouteContext> => {
    const me = await requireMe(context.queryClient, location.href);
    const platform = await context.queryClient.ensureQueryData(platformContextQuery);
    return { me, access: { area: OrgKind.platform, orgId: null, context: platform } };
  },
  errorComponent: (props) =>
    isFailure(props.error, ErrorCode.not_found) ? <NoAccess /> : <RouteError {...props} />,
  component: PlatformLayout,
});

function PlatformLayout() {
  const route = Route.useRouteContext();
  const me = useQuery(meQuery).data ?? route.me;
  useSyncLocale(me);
  return (
    <AppShell access={route.access} me={me}>
      <Outlet />
    </AppShell>
  );
}
