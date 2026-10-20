import type { TenantStatus } from '@rampflow/shared/modules/core/values';
import { BadgeTone } from '@rampflow/shared/values';
import { CircleCheckIcon, type LucideIcon, SproutIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/status-badge';

// The tenant status as icon plus label (PL-04), so it never relies on color.

const TENANT_STATUS: Record<TenantStatus, { icon: LucideIcon; tone: BadgeTone }> = {
  onboarding: { icon: SproutIcon, tone: BadgeTone.planned },
  active: { icon: CircleCheckIcon, tone: BadgeTone.success },
};

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const { t } = useTranslation();
  return (
    <StatusBadge
      meta={{ ...TENANT_STATUS[status], label: t(($) => $.platform.tenant_status[status]) }}
    />
  );
}
