import { SettingScope } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import { assertTopic, settingsQuery, topicParams } from '@/modules/core/settings-levels';
import { SettingsTopicPage, topicCrumb } from '@/modules/core/settings-pages';

export const Route = createFileRoute('/t/$orgId/sites/$siteId/settings/$topic')({
  params: topicParams,
  staticData: { crumb: topicCrumb },
  loader: async ({ context, params }) =>
    assertTopic(
      await context.queryClient.ensureQueryData(
        settingsQuery({ scope: SettingScope.site, orgId: params.orgId, siteId: params.siteId }),
      ),
      params.topic,
    ),
  component: function SiteTopic() {
    const { orgId, siteId, topic } = Route.useParams();
    return <SettingsTopicPage level={{ scope: SettingScope.site, orgId, siteId }} topic={topic} />;
  },
});
