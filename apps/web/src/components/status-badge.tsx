import { type BookingStatus, Punctuality } from '@rampflow/shared/modules/booking/values';
import type { BriefingState } from '@rampflow/shared/modules/safety/values';
import { BadgeSize, BadgeTone } from '@rampflow/shared/values';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  AlarmClockIcon,
  BanIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CircleCheckIcon,
  ClockIcon,
  DoorOpenIcon,
  HourglassIcon,
  LogInIcon,
  LogOutIcon,
  type LucideIcon,
  OctagonXIcon,
  PackageOpenIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  TimerIcon,
  UserXIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  tone: BadgeTone;
}

// One registry per status family. Status is never conveyed by colour alone:
// every badge renders icon + label, and the tone only reinforces it.
export const BOOKING_STATUS: Record<BookingStatus, StatusMeta> = {
  requested: { label: 'Requested', icon: HourglassIcon, tone: BadgeTone.planned },
  confirmed: { label: 'Confirmed', icon: CalendarCheckIcon, tone: BadgeTone.planned },
  checked_in: { label: 'Checked in', icon: LogInIcon, tone: BadgeTone.onsite },
  called: { label: 'Called', icon: BellRingIcon, tone: BadgeTone.active },
  at_dock: { label: 'At dock', icon: DoorOpenIcon, tone: BadgeTone.active },
  loading: { label: 'Loading', icon: PackageOpenIcon, tone: BadgeTone.active },
  done: { label: 'Done', icon: CircleCheckIcon, tone: BadgeTone.success },
  departed: { label: 'Departed', icon: LogOutIcon, tone: BadgeTone.neutral },
  cancelled: { label: 'Cancelled', icon: BanIcon, tone: BadgeTone.neutral },
  no_show: { label: 'No-show', icon: UserXIcon, tone: BadgeTone.danger },
  turned_away: { label: 'Turned away', icon: OctagonXIcon, tone: BadgeTone.danger },
};

export const SAFETY_STATUS: Record<BriefingState, StatusMeta> = {
  valid: { label: 'Briefing valid', icon: ShieldCheckIcon, tone: BadgeTone.success },
  missing: { label: 'Briefing missing', icon: ShieldAlertIcon, tone: BadgeTone.danger },
  expired: { label: 'Briefing expired', icon: ShieldXIcon, tone: BadgeTone.danger },
  outdated: { label: 'Briefing outdated', icon: ShieldXIcon, tone: BadgeTone.onsite },
};

export const PUNCTUALITY: Record<Punctuality, StatusMeta> = {
  early: { label: 'Early', icon: TimerIcon, tone: BadgeTone.neutral },
  on_time: { label: 'On time', icon: ClockIcon, tone: BadgeTone.success },
  late: { label: 'Late', icon: AlarmClockIcon, tone: BadgeTone.onsite },
};

export const toneClasses: Record<BadgeTone, string> = {
  planned: 'bg-tone-planned-bg text-tone-planned border-tone-planned-border',
  onsite: 'bg-tone-onsite-bg text-tone-onsite border-tone-onsite-border',
  active: 'bg-tone-active-bg text-tone-active border-tone-active-border',
  success: 'bg-tone-success-bg text-tone-success border-tone-success-border',
  danger: 'bg-tone-danger-bg text-tone-danger border-tone-danger-border',
  neutral: 'bg-tone-neutral-bg text-tone-neutral border-tone-neutral-border',
};

const statusBadgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md border font-medium',
  {
    variants: {
      size: {
        [BadgeSize.sm]: 'h-5 px-1.5 text-[11px] [&>svg]:size-3',
        [BadgeSize.md]: 'h-6 px-2 text-xs [&>svg]:size-3.5',
        [BadgeSize.lg]: 'h-8 px-2.5 text-sm [&>svg]:size-4',
        [BadgeSize.xl]: 'h-11 px-3.5 text-base [&>svg]:size-5',
      },
    },
    defaultVariants: { size: BadgeSize.md },
  },
);

export interface StatusBadgeProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof statusBadgeVariants> {
  meta: StatusMeta;
  /** Override the registry label, e.g. "Late +12 min". */
  label?: string;
}

export function StatusBadge({ meta, label, size, className, ...props }: StatusBadgeProps) {
  const Icon = meta.icon;
  return (
    <span
      data-slot="status-badge"
      data-tone={meta.tone}
      className={cn(statusBadgeVariants({ size }), toneClasses[meta.tone], className)}
      {...props}
    >
      <Icon aria-hidden />
      {label ?? meta.label}
    </span>
  );
}

export function BookingStatusBadge({
  status,
  ...props
}: { status: BookingStatus } & Omit<StatusBadgeProps, 'meta'>) {
  return <StatusBadge meta={BOOKING_STATUS[status]} {...props} />;
}

export function SafetyBadge({
  status,
  ...props
}: { status: BriefingState } & Omit<StatusBadgeProps, 'meta'>) {
  return <StatusBadge meta={SAFETY_STATUS[status]} {...props} />;
}

export function PunctualityBadge({
  punctuality,
  minutes,
  ...props
}: { punctuality: Punctuality; minutes?: number } & Omit<StatusBadgeProps, 'meta' | 'label'>) {
  const meta = PUNCTUALITY[punctuality];
  const label =
    minutes === undefined || punctuality === Punctuality.on_time
      ? meta.label
      : `${meta.label} ${punctuality === Punctuality.late ? '+' : '-'}${minutes} min`;
  return <StatusBadge meta={meta} label={label} {...props} />;
}
