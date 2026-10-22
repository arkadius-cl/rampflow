import type { BookingStatus } from '@rampflow/shared/modules/booking/values';
import { BadgeTone, DriverBadgeSize } from '@rampflow/shared/values';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  BanIcon,
  CalendarCheckIcon,
  CircleCheckIcon,
  CircleMinusIcon,
  ClockIcon,
  ForkliftIcon,
  LogOutIcon,
  type LucideIcon,
  MapPinIcon,
  MegaphoneIcon,
  PackageOpenIcon,
  UserXIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// apps/web's BookingStatusBadge with the driver's translated labels: icon and label, the tone
// only reinforces them (status never relies on colour alone). Icons and tones follow the yrd
// design system (design/yrd/components/status/StatusBadge.jsx).

const STATUS: Record<BookingStatus, { icon: LucideIcon; tone: BadgeTone; strike?: boolean }> = {
  requested: { icon: ClockIcon, tone: BadgeTone.onsite },
  confirmed: { icon: CalendarCheckIcon, tone: BadgeTone.planned },
  checked_in: { icon: MapPinIcon, tone: BadgeTone.onsite },
  called: { icon: MegaphoneIcon, tone: BadgeTone.active },
  at_dock: { icon: ForkliftIcon, tone: BadgeTone.active },
  loading: { icon: PackageOpenIcon, tone: BadgeTone.active },
  done: { icon: CircleCheckIcon, tone: BadgeTone.success },
  departed: { icon: LogOutIcon, tone: BadgeTone.neutral },
  cancelled: { icon: CircleMinusIcon, tone: BadgeTone.neutral, strike: true },
  no_show: { icon: UserXIcon, tone: BadgeTone.danger },
  turned_away: { icon: BanIcon, tone: BadgeTone.danger },
};

const badge = cva(
  'inline-flex w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-sm font-medium',
  {
    variants: {
      size: {
        [DriverBadgeSize.lg]: 'h-10 px-3.5 text-md [&>svg]:size-5',
        [DriverBadgeSize.xl]: 'h-11 px-3.5 text-md [&>svg]:size-6',
      },
      tone: {
        [BadgeTone.planned]: 'bg-tone-planned-bg text-tone-planned',
        [BadgeTone.onsite]: 'bg-tone-onsite-bg text-tone-onsite',
        [BadgeTone.active]: 'bg-tone-active-bg text-tone-active',
        [BadgeTone.success]: 'bg-tone-success-bg text-tone-success',
        [BadgeTone.danger]: 'bg-tone-danger-bg text-tone-danger',
        [BadgeTone.neutral]: 'bg-tone-neutral-bg text-tone-neutral',
      },
    },
    defaultVariants: { size: DriverBadgeSize.lg },
  },
);

export function BookingStatusBadge({
  status,
  size,
  className,
}: { status: BookingStatus; className?: string } & Pick<VariantProps<typeof badge>, 'size'>) {
  const { t } = useTranslation();
  const { icon: Icon, tone, strike } = STATUS[status];
  return (
    <span
      data-slot="status-badge"
      className={cn(badge({ size, tone }), strike && 'line-through decoration-1', className)}
    >
      <Icon aria-hidden />
      {t(($) => $.app.status[status])}
    </span>
  );
}
