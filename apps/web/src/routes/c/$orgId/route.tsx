import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell/app-shell';
import { NoAccess, RouteError } from '@/components/app-shell/route-states';
import { useSyncLocale } from '@/components/app-shell/user-menu';
import {
  type AreaAccess,
  type AreaRouteContext,
  carrierContextQuery,
  meQuery,
  requireMe,
} from '@/lib/access';
import { isFailure } from '@/lib/api';

// The carrier area (ADR-0011): one carrier org, every linked tenant inside it through filters.

export const Route = createFileRoute('/c/$orgId')({
  beforeLoad: async ({ context, params, location }): Promise<AreaRouteContext> => {
    const me = await requireMe(context.queryClient, location.href);
    const carrier = await context.queryClient.ensureQueryData(carrierContextQuery(params.orgId));
    return { me, access: { area: 'carrier', orgId: params.orgId, context: carrier } };
  },
  errorComponent: (props) =>
    isFailure(props.error, 'not_found') ? <NoAccess /> : <RouteError {...props} />,
  component: CarrierLayout,
});

function CarrierLayout() {
  const route = Route.useRouteContext();
  const { orgId } = Route.useParams();
  const me = useQuery(meQuery).data ?? route.me;
  const context = useQuery(carrierContextQuery(orgId)).data ?? route.access.context;
  const access = { ...route.access, context } as Extract<AreaAccess, { area: 'carrier' }>;
  useSyncLocale(me);
  return (
    <AppShell access={access} me={me}>
      <Outlet />
    </AppShell>
  );
}
