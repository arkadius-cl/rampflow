import type { SettingsView } from '@rampflow/shared/modules/core/api.settings';
import { OrgKind, Permission } from '@rampflow/shared/values';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Building2Icon, MapPinIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { PageHeader } from '@/components/shells/office-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { guard, tenantContextQuery } from '@/lib/access';
import { api, call } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { tenantSettingsQuery } from '@/modules/core/queries';
import { SettingsSections } from '@/modules/core/settings-sections';
import type { SettingChanges } from '@/modules/core/settings-topic-form';

// TN-02: the tenant level and one tab per site (`?site=`). Each field shows its value and where
// it comes from; a save refreshes the tenant context, so `useAccess().setting` sees it at once.

const SettingsSearch = z.object({ site: z.uuid().optional().catch(undefined) });

export const Route = createFileRoute('/t/$orgId/settings/')({
  validateSearch: SettingsSearch,
  beforeLoad: guard({ permission: Permission.core.manage_settings }),
  component: TenantSettingsPage,
});

const TENANT_TAB = 'tenant';

function TenantSettingsPage() {
  const { t } = useTranslation();
  const { orgId } = Route.useParams();
  const { site } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const context = useQuery(tenantContextQuery(orgId));
  const sites = context.data?.sites ?? [];
  const siteId = site && sites.some((s) => s.id === site) ? site : null;
  const settings = useQuery(tenantSettingsQuery(orgId, siteId));

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tenant', orgId, 'core', 'settings'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.context(OrgKind.tenant, orgId) }),
    ]);
  const save = async (changes: SettingChanges) => {
    const view = await call<SettingsView>(
      api.t[':orgId'].settings.$patch({ param: { orgId }, json: { siteId, ...changes } }),
    );
    await refresh();
    return view;
  };

  const tab = siteId ?? TENANT_TAB;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $['settings-ui'].title)}
        description={t(($) => $['settings-ui'].description)}
      />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({ search: { site: value === TENANT_TAB ? undefined : String(value) } })
        }
      >
        <TabsList aria-label={t(($) => $['settings-ui'].scope_tabs)} className="flex-wrap">
          <TabsTrigger value={TENANT_TAB}>
            <Building2Icon /> {t(($) => $['settings-ui'].tenant_tab)}
          </TabsTrigger>
          {sites.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              <MapPinIcon /> {s.name}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="pt-4">
          {settings.data ? (
            <SettingsSections key={tab} view={settings.data} save={save} />
          ) : (
            <Skeleton className="h-64 max-w-5xl" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
