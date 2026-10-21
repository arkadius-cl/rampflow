import { TenantStatus } from '@rampflow/shared/modules/core/values';
import { Permission } from '@rampflow/shared/values';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { AreaHome } from '@/components/app-shell/area-home';
import { useAccess, useTenantStatus } from '@/lib/access';

// The tenant home: the onboarding checklist for those who can work it while the first dock is
// missing (ON-01), otherwise the first screen of the navigation.

export const Route = createFileRoute('/t/$orgId/')({ component: TenantHome });

function TenantHome() {
  const { orgId } = Route.useParams();
  const status = useTenantStatus();
  const { can } = useAccess();
  if (status === TenantStatus.onboarding && can(Permission.core.manage_sites)) {
    return <Navigate to="/t/$orgId/onboarding" params={{ orgId }} replace />;
  }
  return <AreaHome />;
}
