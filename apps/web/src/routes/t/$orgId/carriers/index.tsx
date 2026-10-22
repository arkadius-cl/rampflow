import { CarriersTab } from '@rampflow/shared/modules/booking/values';
import { Feature, Permission } from '@rampflow/shared/values';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { PageHeader } from '@/components/shells/page';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { guard, useAccess } from '@/lib/access';
import { InviteCarrierDialog } from '@/modules/carriers/invite-dialog';
import { LinkedTab } from '@/modules/carriers/linked-tab';
import { LinksTab } from '@/modules/carriers/links-tab';
import { RegistrationsTab } from '@/modules/carriers/registrations-tab';

// TN-03, TN-04: /t/$orgId/carriers?tab=linked|registrations|links (ADR-0011).

const CarriersSearch = z.object({ tab: z.enum(CarriersTab).optional().catch(undefined) });

export const Route = createFileRoute('/t/$orgId/carriers/')({
  validateSearch: CarriersSearch,
  beforeLoad: guard({ permission: Permission.booking.manage_carriers }),
  component: CarriersPage,
});

function TabFallback() {
  return (
    <div className="flex flex-col gap-2" role="status">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function CarriersPage() {
  const { t } = useTranslation('booking');
  const { orgId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { has } = useAccess();
  const publicLinks = has(Feature.booking.public_link);
  const requested = Route.useSearch().tab ?? CarriersTab.linked;
  const tab: CarriersTab = publicLinks ? requested : CarriersTab.linked;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.carriers.title)}
        description={t(($) => $.carriers.description)}
        actions={has(Feature.booking.carrier_portal) ? <InviteCarrierDialog orgId={orgId} /> : null}
      />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({ search: { tab: value as CarriersTab }, replace: true })
        }
      >
        <TabsList>
          <TabsTrigger value="linked">{t(($) => $.carriers.tabs.linked)}</TabsTrigger>
          {publicLinks ? (
            <>
              <TabsTrigger value="registrations">
                {t(($) => $.carriers.tabs.registrations)}
              </TabsTrigger>
              <TabsTrigger value="links">{t(($) => $.carriers.tabs.links)}</TabsTrigger>
            </>
          ) : null}
        </TabsList>
        <TabsContent value="linked" className="pt-2">
          <Suspense fallback={<TabFallback />}>
            <LinkedTab orgId={orgId} />
          </Suspense>
        </TabsContent>
        {publicLinks ? (
          <>
            <TabsContent value="registrations" className="pt-2">
              <Suspense fallback={<TabFallback />}>
                <RegistrationsTab orgId={orgId} />
              </Suspense>
            </TabsContent>
            <TabsContent value="links" className="pt-2">
              <Suspense fallback={<TabFallback />}>
                <LinksTab orgId={orgId} />
              </Suspense>
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
