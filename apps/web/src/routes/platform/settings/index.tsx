import type { SettingsView } from '@rampflow/shared/modules/core/api.settings';
import { Permission } from '@rampflow/shared/values';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shells/office-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { guard } from '@/lib/access';
import { api, call } from '@/lib/api';
import { platformKeys, platformSettingsQuery } from '@/modules/core/queries';
import { SettingsSections } from '@/modules/core/settings-sections';
import type { SettingChanges } from '@/modules/core/settings-topic-form';

// PL-03: every setting with a platform level. A tenant or site override keeps winning.

export const Route = createFileRoute('/platform/settings/')({
  beforeLoad: guard({ permission: Permission.core.manage_platform_settings }),
  component: PlatformSettingsPage,
});

function PlatformSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useQuery(platformSettingsQuery);
  const save = async (changes: SettingChanges) => {
    const view = await call<SettingsView>(api.platform.settings.$patch({ json: changes }));
    await queryClient.invalidateQueries({ queryKey: platformKeys.settings() });
    return view;
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t(($) => $['settings-ui'].platform_title)}
        description={t(($) => $['settings-ui'].platform_description)}
      />
      {settings.data ? (
        <SettingsSections view={settings.data} save={save} />
      ) : (
        <Skeleton className="h-64 max-w-5xl" />
      )}
    </div>
  );
}
