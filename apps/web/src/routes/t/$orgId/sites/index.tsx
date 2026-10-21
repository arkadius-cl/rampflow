import { Permission } from '@rampflow/shared/values';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { MapPinIcon, PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { PageHeader } from '@/components/shells/office-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { guard } from '@/lib/access';
import { siteQueries } from '@/modules/capacity/queries';
import { SiteFormSheet } from '@/modules/capacity/site-form';
import { UsageMeters } from '@/modules/capacity/site-nav';

// MD-01: the org's sites with usage against the package limits, and "New site". `?new=1` opens
// the "New site" form, the link of the onboarding checklist (ON-01).

const SitesSearch = z.object({ new: z.literal(1).optional().catch(undefined) });

export const Route = createFileRoute('/t/$orgId/sites/')({
  validateSearch: SitesSearch,
  beforeLoad: guard({ permission: Permission.core.manage_sites }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(siteQueries.list(params.orgId)),
  component: SitesPage,
});

function SitesPage() {
  const { t } = useTranslation();
  const { orgId } = Route.useParams();
  const { items, usage } = useSuspenseQuery(siteQueries.list(orgId)).data;
  const creating = Route.useSearch().new === 1;
  const navigate = useNavigate({ from: Route.fullPath });
  const setCreating = (open: boolean) =>
    navigate({ search: open ? { new: 1 } : {}, replace: !open });
  const newSite = (
    <Button size="sm" onClick={() => setCreating(true)}>
      <PlusIcon /> {t(($) => $.sites.new_site)}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $.sites.title)}
        description={t(($) => $.sites.description)}
        actions={newSite}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {items.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPinIcon />
              </EmptyMedia>
              <EmptyTitle>{t(($) => $.sites.empty.title)}</EmptyTitle>
              <EmptyDescription>{t(($) => $.sites.empty.description)}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{newSite}</EmptyContent>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t(($) => $.sites.columns.name)}</TableHead>
                  <TableHead>{t(($) => $.sites.columns.address)}</TableHead>
                  <TableHead>{t(($) => $.sites.columns.time_zone)}</TableHead>
                  <TableHead className="pr-4">{t(($) => $.sites.columns.status)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell className="pl-4 font-medium">
                      <Link
                        to="/t/$orgId/sites/$siteId"
                        params={{ orgId, siteId: site.id }}
                        className="underline-offset-4 hover:underline"
                      >
                        {site.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {site.postalCode} {site.city}, {site.subdivision ?? site.country}
                    </TableCell>
                    <TableCell>{site.timeZone}</TableCell>
                    <TableCell className="pr-4">
                      <Badge variant={site.active ? 'secondary' : 'outline'}>
                        {site.active
                          ? t(($) => $.sites.status.active)
                          : t(($) => $.sites.status.inactive)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <UsageMeters orgId={orgId} usage={usage} className="self-start" />
      </div>
      <SiteFormSheet orgId={orgId} open={creating} onOpenChange={setCreating} />
    </div>
  );
}
