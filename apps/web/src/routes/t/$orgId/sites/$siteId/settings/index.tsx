import { SettingScope } from '@rampflow/shared/values';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { firstTopic, settingsQuery, topicLink } from '@/modules/core/settings-levels';

export const Route = createFileRoute('/t/$orgId/sites/$siteId/settings/')({
  beforeLoad: async ({ context, params }) => {
    const level = { scope: SettingScope.site, ...params } as const;
    const view = await context.queryClient.ensureQueryData(settingsQuery(level));
    throw redirect({ ...topicLink(level, firstTopic(view)), replace: true });
  },
});
