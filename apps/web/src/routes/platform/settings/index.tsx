import type { SettingEntry } from '@rampflow/shared/modules/core/api.settings';
import { Permission, SettingScope } from '@rampflow/shared/values';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shells/office-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { guard } from '@/lib/access';
import { api, call } from '@/lib/api';
import { platformKeys, platformSettingsQuery } from '@/modules/core/queries';
import { type SettingsActions, SettingsSections } from '@/modules/core/settings-sections';

// PL-03: every setting with a platform level. A tenant or site override keeps winning.

export const Route = createFileRoute('/platform/settings/')({
  beforeLoad: guard({ permission: Permission.core.manage_platform_settings }),
  component: PlatformSettingsPage,
});

function PlatformSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useQuery(platformSettingsQuery);
  const refresh = () => queryClient.invalidateQueries({ queryKey: platformKeys.settings() });
  const actions: SettingsActions = {
    save: async (key, value) => {
      await call<SettingEntry>(
        api.platform.settings[':key'].$put({ param: { key }, json: { value } }),
      );
      await refresh();
      toast.success(t(($) => $['settings-ui'].saved));
    },
    reset: async (key) => {
      await call(api.platform.settings[':key'].$delete({ param: { key } }));
      await refresh();
      toast.success(t(($) => $['settings-ui'].reset_done));
    },
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $['settings-ui'].platform_title)}
        description={t(($) => $['settings-ui'].platform_description)}
      />
      {settings.data ? (
        <SettingsSections
          items={settings.data.items}
          scope={SettingScope.platform}
          actions={actions}
        />
      ) : (
        <Skeleton className="h-64 max-w-5xl" />
      )}
    </div>
  );
}
