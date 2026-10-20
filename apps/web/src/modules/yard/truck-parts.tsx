import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import { SafetyStatus } from '@rampflow/shared/modules/safety/values';
import type { YardTruck } from '@rampflow/shared/modules/yard/api';
import { BadgeTone, StaffLocale } from '@rampflow/shared/values';
import { ShieldIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SiteTime, SiteTimeRange } from '@/components/site-time';
import {
  BOOKING_STATUS,
  PUNCTUALITY,
  SAFETY_STATUS,
  StatusBadge,
  type StatusBadgeProps,
} from '@/components/status-badge';
import { useLocale } from '@/lib/i18n';
import { useSiteTime } from '@/lib/time';

// Pieces every gate and dock row shows: the slot in site time, the booking status, the safety
// status and the punctuality, each as icon plus translated label (status never by colour alone).

type Size = StatusBadgeProps['size'];

export function SlotRange({ truck, className }: { truck: YardTruck; className?: string }) {
  const format = useSiteTime();
  const start = format(truck.startsAt, truck.timeZone);
  const end = format(truck.endsAt, truck.timeZone);
  return (
    <SiteTimeRange start={start.time} end={end.time} zone={start.zone} className={className} />
  );
}

export function InstantTime({
  at,
  timeZone,
  className,
}: {
  at: string | Date;
  timeZone: string;
  className?: string;
}) {
  const format = useSiteTime();
  const parts = format(at, timeZone);
  return <SiteTime time={parts.time} zone={parts.zone} className={className} />;
}

export function TruckStatus({ status, size }: { status: YardTruck['status']; size?: Size }) {
  const { t } = useTranslation('booking');
  if (status === BookingStatus.requested) return null;
  return (
    <StatusBadge
      meta={BOOKING_STATUS[status]}
      label={t(($) => $.lifecycle.status[status])}
      size={size}
    />
  );
}

export function TruckSafety({ safety, size }: { safety: YardTruck['safety']; size?: Size }) {
  const { t } = useTranslation('yard');
  const meta =
    safety.status === SafetyStatus.not_required
      ? { ...SAFETY_STATUS.valid, icon: ShieldIcon, tone: BadgeTone.neutral }
      : SAFETY_STATUS[safety.status];
  return <StatusBadge meta={meta} label={t(($) => $.gate.safety[safety.status])} size={size} />;
}

export function TruckPunctuality({ truck, size }: { truck: YardTruck; size?: Size }) {
  const { t } = useTranslation('yard');
  const { punctuality, punctualityMinutes } = truck;
  if (!punctuality) return null;
  return (
    <StatusBadge
      meta={PUNCTUALITY[punctuality]}
      label={t(($) => $.gate.punctuality[punctuality], {
        minutes: Math.abs(punctualityMinutes ?? 0),
      })}
      size={size}
    />
  );
}

/** Load type names exist in de and en; pl users read the English one. */
export function useLoadTypeName() {
  const locale = useLocale();
  return (name: YardTruck['loadType']['name']) => (locale === StaffLocale.de ? name.de : name.en);
}
