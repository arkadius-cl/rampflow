import type {
  PlatformMemberState,
  TaxIdStatus,
  TenantFlag,
  TenantNoteKind,
  TenantStatus,
} from '@rampflow/shared/modules/core/values';
import { BadgeTone } from '@rampflow/shared/values';
import {
  BadgeCheckIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  CirclePlayIcon,
  ClockIcon,
  CloudOffIcon,
  CopyIcon,
  HourglassIcon,
  type LucideIcon,
  MailIcon,
  MailXIcon,
  ShieldAlertIcon,
  StickyNoteIcon,
  UserCheckIcon,
  UserMinusIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type StatusBadgeProps } from '@/components/status-badge';

// The platform's status badge registries (PL-04, PL-06, PL-08): icon and tone per value set, the
// label from the catalog, so no status relies on colour. Icons and tones follow the design of
// change 04 ("Status badge registries"); the tenant status tones are the contract.

type Look = { icon: LucideIcon; tone: BadgeTone };
type BadgeRest = Omit<StatusBadgeProps, 'meta' | 'label'>;

export const TENANT_STATUS: Record<TenantStatus, Look> = {
  onboarding: { icon: HourglassIcon, tone: BadgeTone.onsite },
  active: { icon: CircleCheckIcon, tone: BadgeTone.success },
  suspended: { icon: CirclePauseIcon, tone: BadgeTone.danger },
};

export const TAX_ID_STATUS: Record<TaxIdStatus, Look> = {
  pending: { icon: ClockIcon, tone: BadgeTone.neutral },
  verified: { icon: BadgeCheckIcon, tone: BadgeTone.success },
  unverified: { icon: ShieldAlertIcon, tone: BadgeTone.danger },
  unavailable: { icon: CloudOffIcon, tone: BadgeTone.neutral },
};

export const TENANT_FLAG: Record<TenantFlag, Look> = {
  possible_duplicate: { icon: CopyIcon, tone: BadgeTone.neutral },
  tax_id_unverified: { icon: ShieldAlertIcon, tone: BadgeTone.neutral },
};

export const TENANT_NOTE_KIND: Record<TenantNoteKind, Look> = {
  note: { icon: StickyNoteIcon, tone: BadgeTone.neutral },
  suspended: { icon: CirclePauseIcon, tone: BadgeTone.danger },
  reactivated: { icon: CirclePlayIcon, tone: BadgeTone.success },
};

export const PLATFORM_MEMBER_STATE: Record<PlatformMemberState, Look> = {
  member: { icon: UserCheckIcon, tone: BadgeTone.success },
  disabled: { icon: UserMinusIcon, tone: BadgeTone.neutral },
  invited: { icon: MailIcon, tone: BadgeTone.planned },
  expired: { icon: MailXIcon, tone: BadgeTone.neutral },
};

/** The marker on an admin email that is still an open invitation. */
export const INVITED: Look = { icon: MailIcon, tone: BadgeTone.neutral };

export function TenantStatusBadge({ status, ...props }: { status: TenantStatus } & BadgeRest) {
  const { t } = useTranslation();
  const label = t(($) => $.platform.tenant_status[status]);
  return <StatusBadge meta={{ ...TENANT_STATUS[status], label }} {...props} />;
}

export function TaxIdStatusBadge({ status, ...props }: { status: TaxIdStatus } & BadgeRest) {
  const { t } = useTranslation();
  const label = t(($) => $.platform.tax_id_status[status]);
  return <StatusBadge meta={{ ...TAX_ID_STATUS[status], label }} {...props} />;
}

export function TenantFlagBadge({ flag, ...props }: { flag: TenantFlag } & BadgeRest) {
  const { t } = useTranslation();
  const label = t(($) => $.platform.tenant_flag[flag]);
  return <StatusBadge meta={{ ...TENANT_FLAG[flag], label }} {...props} />;
}

export function TenantNoteKindBadge({ kind, ...props }: { kind: TenantNoteKind } & BadgeRest) {
  const { t } = useTranslation();
  const label = t(($) => $.platform.note_kind[kind]);
  return <StatusBadge meta={{ ...TENANT_NOTE_KIND[kind], label }} {...props} />;
}

export function MemberStateBadge({ state, ...props }: { state: PlatformMemberState } & BadgeRest) {
  const { t } = useTranslation();
  const label = t(($) => $.platform.member_state[state]);
  return <StatusBadge meta={{ ...PLATFORM_MEMBER_STATE[state], label }} {...props} />;
}

export function InvitedBadge(props: BadgeRest) {
  const { t } = useTranslation();
  return (
    <StatusBadge meta={{ ...INVITED, label: t(($) => $.platform.tenants.invited) }} {...props} />
  );
}
