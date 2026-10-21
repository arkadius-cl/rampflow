import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  firstTopic,
  PLATFORM_LEVEL,
  settingsQuery,
  topicLink,
} from '@/modules/core/settings-levels';

export const Route = createFileRoute('/platform/settings/')({
  beforeLoad: async ({ context }) => {
    const view = await context.queryClient.ensureQueryData(settingsQuery(PLATFORM_LEVEL));
    throw redirect({ ...topicLink(PLATFORM_LEVEL, firstTopic(view)), replace: true });
  },
});
