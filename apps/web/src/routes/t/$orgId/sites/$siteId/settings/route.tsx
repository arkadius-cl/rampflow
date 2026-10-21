import { Permission, SettingScope } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import { NoAccess } from '@/components/app-shell/route-states';
import { guard } from '@/lib/access';
import { settingsQuery } from '@/modules/core/settings-levels';
import { SiteSettingsLayout } from '@/modules/core/settings-pages';

// TN-02, MD-01: the settings of one site, as the last tab of the site view.

export const Route = createFileRoute('/t/$orgId/sites/$siteId/settings')({
  beforeLoad: guard({ permission: Permission.core.manage_settings }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(settingsQuery({ scope: SettingScope.site, ...params })),
  staticData: { crumb: (_, t) => t(($) => $.sites.tabs.settings) },
  notFoundComponent: NoAccess,
  component: function SiteSettings() {
    const params = Route.useParams();
    return <SiteSettingsLayout level={{ scope: SettingScope.site, ...params }} />;
  },
});
