import { TenantStatus } from '@rampflow/shared/modules/core/values';
import { RowActionKind } from '@rampflow/shared/values';
import { useNavigate } from '@tanstack/react-router';
import { CirclePauseIcon, CirclePlayIcon, EyeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RowActions } from '@/components/data-table/row-actions';
import type { SuspensionTarget } from './tenant-suspension';

/** The tenant list's "…" menu (PL-04): View, then Suspend (red) or Reactivate. */
export function TenantRowActions({
  tenant,
  onSuspension,
}: {
  tenant: SuspensionTarget;
  onSuspension: (tenant: SuspensionTarget) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const suspended = tenant.status === TenantStatus.suspended;
  return (
    <RowActions
      label={t(($) => $.platform.tenants.actions_for, { name: tenant.name })}
      actions={[
        {
          kind: RowActionKind.view,
          label: t(($) => $.platform.tenants.view),
          icon: EyeIcon,
          onSelect: () =>
            void navigate({ to: '/platform/tenants/$tenantId', params: { tenantId: tenant.id } }),
        },
        suspended
          ? {
              kind: RowActionKind.other,
              label: t(($) => $.platform.tenants.reactivate),
              icon: CirclePlayIcon,
              onSelect: () => onSuspension(tenant),
            }
          : {
              kind: RowActionKind.destructive,
              label: t(($) => $.platform.tenants.suspend),
              icon: CirclePauseIcon,
              onSelect: () => onSuspension(tenant),
            },
      ]}
    />
  );
}
