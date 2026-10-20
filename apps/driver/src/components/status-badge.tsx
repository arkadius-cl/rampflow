import type { BookingStatus } from '@rampflow/shared/modules/booking/lifecycle';
import { BadgeTone, DriverBadgeSize } from '@rampflow/shared/values';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  BanIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CircleCheckIcon,
  DoorOpenIcon,
  LogInIcon,
  LogOutIcon,
  type LucideIcon,
  OctagonXIcon,
  PackageOpenIcon,
  SendIcon,
  UserXIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// apps/web's BookingStatusBadge with the driver's translated labels: icon and label, the tone
// only reinforces them (status never relies on colour alone).

const STATUS: Record<BookingStatus, { icon: LucideIcon; tone: BadgeTone }> = {
  requested: { icon: SendIcon, tone: BadgeTone.neutral },
  confirmed: { icon: CalendarCheckIcon, tone: BadgeTone.planned },
  checked_in: { icon: LogInIcon, tone: BadgeTone.onsite },
  called: { icon: BellRingIcon, tone: BadgeTone.active },
  at_dock: { icon: DoorOpenIcon, tone: BadgeTone.active },
  loading: { icon: PackageOpenIcon, tone: BadgeTone.active },
  done: { icon: CircleCheckIcon, tone: BadgeTone.success },
  departed: { icon: LogOutIcon, tone: BadgeTone.neutral },
  cancelled: { icon: BanIcon, tone: BadgeTone.neutral },
  no_show: { icon: UserXIcon, tone: BadgeTone.danger },
  turned_away: { icon: OctagonXIcon, tone: BadgeTone.danger },
};

const badge = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border font-medium',
  {
    variants: {
      size: {
        [DriverBadgeSize.lg]: 'h-8 px-2.5 text-sm [&>svg]:size-4',
        [DriverBadgeSize.xl]: 'h-11 px-3.5 text-base [&>svg]:size-5',
      },
      tone: {
        [BadgeTone.planned]: 'bg-tone-planned-bg text-tone-planned border-tone-planned-border',
        [BadgeTone.onsite]: 'bg-tone-onsite-bg text-tone-onsite border-tone-onsite-border',
        [BadgeTone.active]: 'bg-tone-active-bg text-tone-active border-tone-active-border',
        [BadgeTone.success]: 'bg-tone-success-bg text-tone-success border-tone-success-border',
        [BadgeTone.danger]: 'bg-tone-danger-bg text-tone-danger border-tone-danger-border',
        [BadgeTone.neutral]: 'bg-tone-neutral-bg text-tone-neutral border-tone-neutral-border',
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
  const { icon: Icon, tone } = STATUS[status];
  return (
    <span data-slot="status-badge" className={cn(badge({ size, tone }), className)}>
      <Icon aria-hidden />
      {t(($) => $.app.status[status])}
    </span>
  );
}
