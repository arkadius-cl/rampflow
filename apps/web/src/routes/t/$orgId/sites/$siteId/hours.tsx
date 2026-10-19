import { addDays, siteDay, type TimeZone } from '@rampflow/shared/time';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { guard } from '@/lib/access';
import { ClosuresCard } from '@/modules/capacity/closures';
import { HoursCard } from '@/modules/capacity/hours';
import { capacityQueries, siteQueries } from '@/modules/capacity/queries';

// MD-04: weekly hours, closures and public holidays of one site.

/** Closures from today (site time) to the end of the holiday import's 400-day window. */
const closureWindow = (timeZone: string) => {
  const from = siteDay(new Date(), timeZone as TimeZone);
  return { from, to: addDays(from, 400) };
};

export const Route = createFileRoute('/t/$orgId/sites/$siteId/hours')({
  beforeLoad: guard({ permission: 'booking.manage_resources' }),
  loader: async ({ context, params }) => {
    const { orgId, siteId } = params;
    const q = context.queryClient;
    const site = await q.ensureQueryData(siteQueries.site(orgId, siteId));
    const { from, to } = closureWindow(site.timeZone);
    await Promise.all([
      q.ensureQueryData(capacityQueries.hours(orgId, siteId)),
      q.ensureQueryData(capacityQueries.closures(orgId, siteId, from, to)),
      q.ensureQueryData(capacityQueries.resources(orgId, siteId)),
      q.ensureQueryData(siteQueries.docks(orgId, siteId)),
    ]);
  },
  component: HoursTab,
});

function HoursTab() {
  const { orgId, siteId } = Route.useParams();
  const site = useSuspenseQuery(siteQueries.site(orgId, siteId)).data;
  const { from, to } = closureWindow(site.timeZone);
  const hours = useSuspenseQuery(capacityQueries.hours(orgId, siteId)).data.items;
  const closures = useSuspenseQuery(capacityQueries.closures(orgId, siteId, from, to)).data.items;
  const resources = useSuspenseQuery(capacityQueries.resources(orgId, siteId)).data.items;
  const docks = useSuspenseQuery(siteQueries.docks(orgId, siteId)).data.items;
  return (
    <div className="flex flex-col gap-4">
      <HoursCard
        orgId={orgId}
        siteId={siteId}
        timeZone={site.timeZone}
        rows={hours}
        resources={resources}
        docks={docks}
      />
      <ClosuresCard
        orgId={orgId}
        siteId={siteId}
        timeZone={site.timeZone}
        closures={closures}
        resources={resources}
        docks={docks}
      />
    </div>
  );
}
