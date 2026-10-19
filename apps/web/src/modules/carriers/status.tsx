import type {
  CarrierLinkStatus,
  RegistrationStatus,
} from '@rampflow/shared/modules/booking/api.carriers';
import {
  BanIcon,
  CircleCheckIcon,
  HourglassIcon,
  type LucideIcon,
  MailQuestionIcon,
  PauseCircleIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type Tone } from '@/components/status-badge';

// Link and registration states as icon plus label (UX concept, principle 2).

const LINK: Record<CarrierLinkStatus, { icon: LucideIcon; tone: Tone }> = {
  active: { icon: CircleCheckIcon, tone: 'success' },
  deactivated: { icon: PauseCircleIcon, tone: 'neutral' },
};

const REGISTRATION: Record<RegistrationStatus, { icon: LucideIcon; tone: Tone }> = {
  pending_email: { icon: MailQuestionIcon, tone: 'neutral' },
  pending_approval: { icon: HourglassIcon, tone: 'onsite' },
  approved: { icon: CircleCheckIcon, tone: 'success' },
  rejected: { icon: BanIcon, tone: 'danger' },
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
