import type { SiteView } from '@rampflow/shared/modules/core/api.sites';
import { PageWidth, Permission } from '@rampflow/shared/values';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Page, PageTab, PageTabs } from '@/components/shells/page';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { guard, useAccess } from '@/lib/access';
import { api, call } from '@/lib/api';
import { siteQueries, useRefreshMasterData } from '@/modules/capacity/queries';
import { SiteFormSheet } from '@/modules/capacity/site-form';
import { SiteNav } from '@/modules/capacity/site-nav';

// MD-01 to MD-05: one site with its tabs (ADR-0011): halls, docks and pools; hours and closures;
// load types; settings (TN-02). The left pane lists every site with the usage meters (ADR-0022:
// a sibling switcher, so the title stands in the content column).

export const Route = createFileRoute('/t/$orgId/sites/$siteId')({
  beforeLoad: guard({ permission: Permission.core.manage_sites }),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(siteQueries.list(params.orgId)),
      context.queryClient.ensureQueryData(siteQueries.site(params.orgId, params.siteId)),
    ]),
  staticData: {
    crumb: (match) => (match.loaderData as [unknown, SiteView] | undefined)?.[1].name,
  },
  component: SiteLayout,
});

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
    <div className="mx-auto grid w-full max-w-page-wide gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <SiteNav orgId={orgId} sites={list.items} usage={list.usage} currentId={siteId} />
      <Page
        width={PageWidth.full}
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
        tabs={
          <PageTabs label={t(($) => $.sites.tabs.label)}>
            <PageTab
              to="/t/$orgId/sites/$siteId"
              params={{ orgId, siteId }}
              activeOptions={{ exact: true }}
            >
              {t(($) => $.sites.tabs.docks)}
            </PageTab>
            {capacity ? (
              <>
                <PageTab to="/t/$orgId/sites/$siteId/hours" params={{ orgId, siteId }}>
                  {t(($) => $.sites.tabs.hours)}
                </PageTab>
                <PageTab to="/t/$orgId/sites/$siteId/load-types" params={{ orgId, siteId }}>
                  {t(($) => $.sites.tabs.load_types)}
                </PageTab>
              </>
            ) : null}
            {can(Permission.core.manage_settings) ? (
              <PageTab to="/t/$orgId/sites/$siteId/settings" params={{ orgId, siteId }}>
                {t(($) => $.sites.tabs.settings)}
              </PageTab>
            ) : null}
          </PageTabs>
        }
      >
        <Outlet />
      </Page>
      <SiteFormSheet orgId={orgId} site={site} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
