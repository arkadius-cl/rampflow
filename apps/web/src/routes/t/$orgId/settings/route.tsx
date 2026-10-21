import { Permission, SettingScope } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import { NoAccess } from '@/components/app-shell/route-states';
import { guard } from '@/lib/access';
import { settingsQuery } from '@/modules/core/settings-levels';
import { SettingsLayout } from '@/modules/core/settings-pages';

// TN-02: the tenant level, one topic per page. Site values live in each site's Settings tab.

export const Route = createFileRoute('/t/$orgId/settings')({
  beforeLoad: guard({ permission: Permission.core.manage_settings }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      settingsQuery({ scope: SettingScope.tenant, orgId: params.orgId }),
    ),
  notFoundComponent: NoAccess,
  component: function TenantSettings() {
    const { orgId } = Route.useParams();
    return <SettingsLayout level={{ scope: SettingScope.tenant, orgId }} />;
  },
});
