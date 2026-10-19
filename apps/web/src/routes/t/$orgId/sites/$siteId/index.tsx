import type { HallView } from '@rampflow/shared/modules/core/api.sites';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PlusIcon, WarehouseIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { allows, useAccess } from '@/lib/access';
import { DockDialog, type DockEdit, HallCard, HallDialog } from '@/modules/capacity/halls';
import { capacityQueries, siteQueries } from '@/modules/capacity/queries';
import { ResourceEditor } from '@/modules/capacity/resource-editor';

// MD-02 and MD-03: halls with their docks, and the editor of pools and single docks.

export const Route = createFileRoute('/t/$orgId/sites/$siteId/')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(siteQueries.halls(params.orgId, params.siteId)),
      context.queryClient.ensureQueryData(siteQueries.docks(params.orgId, params.siteId)),
      allows(context.access, { permission: 'booking.view' })
        ? context.queryClient.ensureQueryData(
            capacityQueries.resources(params.orgId, params.siteId),
          )
        : null,
    ]),
  component: DocksTab,
});

function DocksTab() {
  const { t } = useTranslation();
  const { orgId, siteId } = Route.useParams();
  const { can } = useAccess();
  const canBook = can('booking.manage_resources');
  const halls = useSuspenseQuery(siteQueries.halls(orgId, siteId)).data.items;
  const docks = useSuspenseQuery(siteQueries.docks(orgId, siteId)).data.items;
  const resources =
    useQuery({ ...capacityQueries.resources(orgId, siteId), enabled: can('booking.view') }).data
      ?.items ?? [];
  const [hallDialog, setHallDialog] = useState<{ hall: HallView | null } | null>(null);
  const [dockEdit, setDockEdit] = useState<DockEdit | null>(null);
  const pools = resources.filter((r) => r.kind === 'pool');
  const holderOf = (dock: { resourceId: string | null }) =>
    resources.find((r) => r.id === dock.resourceId);

  const newHall = (
    <Button variant="outline" size="sm" onClick={() => setHallDialog({ hall: null })}>
      <PlusIcon /> {t(($) => $.sites.halls.new)}
    </Button>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {halls.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <WarehouseIcon />
              </EmptyMedia>
              <EmptyTitle>{t(($) => $.sites.halls.empty_title)}</EmptyTitle>
              <EmptyDescription>{t(($) => $.sites.halls.empty)}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{newHall}</EmptyContent>
          </Empty>
        ) : (
          <>
            {halls.map((hall) => (
              <HallCard
                key={hall.id}
                orgId={orgId}
                hall={hall}
                docks={docks.filter((d) => d.hallId === hall.id)}
                holderOf={holderOf}
                pools={pools}
                canBook={canBook}
                onRename={() => setHallDialog({ hall })}
                onDock={setDockEdit}
              />
            ))}
            <div>{newHall}</div>
          </>
        )}
      </div>
      {canBook ? (
        <ResourceEditor orgId={orgId} siteId={siteId} docks={docks} resources={resources} />
      ) : null}
      <HallDialog
        orgId={orgId}
        siteId={siteId}
        hall={hallDialog?.hall ?? null}
        open={hallDialog !== null}
        onOpenChange={(open) => (open ? null : setHallDialog(null))}
      />
      <DockDialog
        orgId={orgId}
        siteId={siteId}
        halls={halls}
        edit={dockEdit}
        onOpenChange={(open) => (open ? null : setDockEdit(null))}
      />
    </div>
  );
}
