import { Permission } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import { guard } from '@/lib/access';
import { OnboardingChecklist } from '@/modules/core/onboarding';
import { onboardingQuery } from '@/modules/core/queries';

// ON-01, ON-02: the steps from an empty company to its first dock, and the active state after it.

export const Route = createFileRoute('/t/$orgId/onboarding/')({
  beforeLoad: guard({ permission: Permission.core.manage_sites }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(onboardingQuery(params.orgId)),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { orgId } = Route.useParams();
  return <OnboardingChecklist orgId={orgId} />;
}
