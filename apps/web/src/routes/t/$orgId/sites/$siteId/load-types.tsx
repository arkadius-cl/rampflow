import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { guard } from '@/lib/access';
import { LoadTypesCard } from '@/modules/capacity/load-types';
import { capacityQueries, siteQueries } from '@/modules/capacity/queries';

// MD-05: load types and their duration rules of one site.

export const Route = createFileRoute('/t/$orgId/sites/$siteId/load-types')({
  beforeLoad: guard({ permission: 'booking.manage_resources' }),
  loader: ({ context, params }) => {
    const { orgId, siteId } = params;
    const q = context.queryClient;
    return Promise.all([
      q.ensureQueryData(capacityQueries.loadTypes(orgId, siteId)),
      q.ensureQueryData(capacityQueries.resources(orgId, siteId)),
      q.ensureQueryData(siteQueries.docks(orgId, siteId)),
    ]);
  },
  component: LoadTypesTab,
});

function LoadTypesTab() {
  const { orgId, siteId } = Route.useParams();
  const loadTypes = useSuspenseQuery(capacityQueries.loadTypes(orgId, siteId)).data.items;
  const resources = useSuspenseQuery(capacityQueries.resources(orgId, siteId)).data.items;
  const docks = useSuspenseQuery(siteQueries.docks(orgId, siteId)).data.items;
  return (
    <LoadTypesCard
      orgId={orgId}
      siteId={siteId}
      loadTypes={loadTypes}
      resources={resources}
      docks={docks}
    />
  );
}
