import { Permission } from '@rampflow/shared/values';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shells/office-shell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { guard, useAccess } from '@/lib/access';
import { api, call } from '@/lib/api';
import { siteQueries, useRefreshMasterData } from '@/modules/capacity/queries';
import { SiteFormSheet } from '@/modules/capacity/site-form';
import { SiteNav } from '@/modules/capacity/site-nav';

// MD-01 to MD-05: one site with its tabs (ADR-0011): halls, docks and pools; hours and closures;
// load types. The left pane lists every site with the usage meters.

export const Route = createFileRoute('/t/$orgId/sites/$siteId')({
  beforeLoad: guard({ permission: Permission.core.manage_sites }),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(siteQueries.list(params.orgId)),
      context.queryClient.ensureQueryData(siteQueries.site(params.orgId, params.siteId)),
    ]),
  component: SiteLayout,
});

const tabClass =
  'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-sm';

function SiteLayout() {
  const { t } = useTranslation();
  const { orgId, siteId } = Route.useParams();
  const { can } = useAccess();
  const list = useSuspenseQuery(siteQueries.list(orgId)).data;
  const site = useSuspenseQuery(siteQueries.site(orgId, siteId)).data;
  const [editing, setEditing] = useState(false);
  const refresh = useRefreshMasterData(orgId);
  const setActive = useMutation({
    mutationFn: (active: boolean) =>
      call(api.t[':orgId'].sites[':siteId'].$patch({ param: { orgId, siteId }, json: { active } })),
    onSettled: refresh,
  });
  const capacity = can(Permission.booking.manage_resources);
  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <SiteNav orgId={orgId} sites={list.items} usage={list.usage} currentId={siteId} />
      <div className="flex min-w-0 flex-col gap-4">
        <PageHeader
          title={site.name}
          description={`${site.addressLine1}, ${site.postalCode} ${site.city} · ${site.timeZone}`}
          actions={
            <>
              <div className="flex items-center gap-2">
                <Switch
                  id="site-active"
                  checked={site.active}
                  disabled={setActive.isPending}
                  onCheckedChange={(active) => setActive.mutate(active)}
                />
                <Label htmlFor="site-active">{t(($) => $.sites.fields.active)}</Label>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <PencilIcon /> {t(($) => $.sites.edit_site)}
              </Button>
            </>
          }
        />
        <nav
          aria-label={t(($) => $.sites.tabs.label)}
          className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
        >
          <Link
            to="/t/$orgId/sites/$siteId"
            params={{ orgId, siteId }}
            activeOptions={{ exact: true }}
            className={tabClass}
          >
            {t(($) => $.sites.tabs.docks)}
          </Link>
          {capacity ? (
            <>
              <Link
                to="/t/$orgId/sites/$siteId/hours"
                params={{ orgId, siteId }}
                className={tabClass}
              >
                {t(($) => $.sites.tabs.hours)}
              </Link>
              <Link
                to="/t/$orgId/sites/$siteId/load-types"
                params={{ orgId, siteId }}
                className={tabClass}
              >
                {t(($) => $.sites.tabs.load_types)}
              </Link>
            </>
          ) : null}
        </nav>
        <Outlet />
      </div>
      <SiteFormSheet orgId={orgId} site={site} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
