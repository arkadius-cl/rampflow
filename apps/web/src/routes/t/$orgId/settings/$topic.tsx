import { SettingScope } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import { assertTopic, settingsQuery, topicParams } from '@/modules/core/settings-levels';
import { SettingsTopicPage, topicCrumb } from '@/modules/core/settings-pages';

export const Route = createFileRoute('/t/$orgId/settings/$topic')({
  params: topicParams,
  staticData: { crumb: topicCrumb },
  loader: async ({ context, params }) =>
    assertTopic(
      await context.queryClient.ensureQueryData(
        settingsQuery({ scope: SettingScope.tenant, orgId: params.orgId }),
      ),
      params.topic,
    ),
  component: function TenantTopic() {
    const { orgId, topic } = Route.useParams();
    return <SettingsTopicPage level={{ scope: SettingScope.tenant, orgId }} topic={topic} />;
  },
});
