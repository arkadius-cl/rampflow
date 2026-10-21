import { createFileRoute } from '@tanstack/react-router';
import {
  assertTopic,
  PLATFORM_LEVEL,
  settingsQuery,
  topicParams,
} from '@/modules/core/settings-levels';
import { SettingsTopicPage, topicCrumb } from '@/modules/core/settings-pages';

export const Route = createFileRoute('/platform/settings/$topic')({
  params: topicParams,
  staticData: { crumb: topicCrumb },
  loader: async ({ context, params }) =>
    assertTopic(
      await context.queryClient.ensureQueryData(settingsQuery(PLATFORM_LEVEL)),
      params.topic,
    ),
  component: function PlatformTopic() {
    const { topic } = Route.useParams();
    return <SettingsTopicPage level={PLATFORM_LEVEL} topic={topic} />;
  },
});
