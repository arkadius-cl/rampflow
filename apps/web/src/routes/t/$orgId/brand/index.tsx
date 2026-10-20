import { Feature, Permission } from '@rampflow/shared/values';
import { createFileRoute } from '@tanstack/react-router';
import { guard } from '@/lib/access';
import { LogoScreen } from '@/modules/brand/logo';

// TN-05: the tenant's logo.

export const Route = createFileRoute('/t/$orgId/brand/')({
  beforeLoad: guard({ permission: Permission.brand.manage, entitlement: Feature.brand.logo }),
  component: BrandPage,
});

function BrandPage() {
  const { orgId } = Route.useParams();
  return <LogoScreen orgId={orgId} />;
}
