import type {
  CarrierLinkStatus,
  RegistrationStatus,
} from '@rampflow/shared/modules/booking/values';
import { BadgeTone } from '@rampflow/shared/values';
import {
  BanIcon,
  CircleCheckIcon,
  HourglassIcon,
  type LucideIcon,
  MailQuestionIcon,
  PauseCircleIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@/components/status-badge';

// Link and registration states as icon plus label (UX concept, principle 2).

const LINK: Record<CarrierLinkStatus, { icon: LucideIcon; tone: BadgeTone }> = {
  active: { icon: CircleCheckIcon, tone: BadgeTone.success },
  deactivated: { icon: PauseCircleIcon, tone: BadgeTone.neutral },
};

const REGISTRATION: Record<RegistrationStatus, { icon: LucideIcon; tone: BadgeTone }> = {
  pending_email: { icon: MailQuestionIcon, tone: BadgeTone.neutral },
  pending_approval: { icon: HourglassIcon, tone: BadgeTone.onsite },
  approved: { icon: CircleCheckIcon, tone: BadgeTone.success },
  rejected: { icon: BanIcon, tone: BadgeTone.danger },
};

export function LinkStatusBadge({ status }: { status: CarrierLinkStatus }) {
  const { t } = useTranslation('booking');
  return <StatusBadge meta={{ ...LINK[status], label: t(($) => $.carriers.status[status]) }} />;
}

export function RegistrationStatusBadge({ status }: { status: RegistrationStatus }) {
  const { t } = useTranslation('booking');
  return (
    <StatusBadge
      meta={{
        ...REGISTRATION[status],
        label: t(($) => $.carriers.registration_status[status]),
      }}
    />
  );
}
