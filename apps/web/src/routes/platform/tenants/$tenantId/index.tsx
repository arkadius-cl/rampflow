import { createFileRoute } from '@tanstack/react-router';
import { TenantOverview } from '@/modules/core/tenant-overview';

// PL-06: the Overview tab, the hub's index (ADR-0015).

export const Route = createFileRoute('/platform/tenants/$tenantId/')({
  component: () => <TenantOverview tenantId={Route.useParams().tenantId} />,
});
