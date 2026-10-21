import { Permission } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import { NoAccess } from '@/components/app-shell/route-states';
import { guard } from '@/lib/access';
import { PLATFORM_LEVEL, settingsQuery } from '@/modules/core/settings-levels';
import { SettingsLayout } from '@/modules/core/settings-pages';

// PL-03: every setting with a platform level, one topic per page. Tenant and site values win.

export const Route = createFileRoute('/platform/settings')({
  beforeLoad: guard({ permission: Permission.core.manage_platform_settings }),
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery(PLATFORM_LEVEL)),
  notFoundComponent: NoAccess,
  component: () => <SettingsLayout level={PLATFORM_LEVEL} />,
});
