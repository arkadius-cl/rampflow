import { cva, type VariantProps } from 'class-variance-authority';
import {
  AlarmClockIcon,
  BanIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CircleCheckIcon,
  ClockIcon,
  DoorOpenIcon,
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
import type { BookingStatus, Punctuality, SafetyStatus } from '@/lib/domain';
import { cn } from '@/lib/utils';

export type Tone = 'planned' | 'onsite' | 'active' | 'success' | 'danger' | 'neutral';

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  tone: Tone;
}

// One registry per status family. Status is never conveyed by colour alone:
// every badge renders icon + label, and the tone only reinforces it.
export const BOOKING_STATUS: Record<BookingStatus, StatusMeta> = {
  confirmed: { label: 'Confirmed', icon: CalendarCheckIcon, tone: 'planned' },
  checked_in: { label: 'Checked in', icon: LogInIcon, tone: 'onsite' },
  called: { label: 'Called', icon: BellRingIcon, tone: 'active' },
  at_dock: { label: 'At dock', icon: DoorOpenIcon, tone: 'active' },
  loading: { label: 'Loading', icon: PackageOpenIcon, tone: 'active' },
  done: { label: 'Done', icon: CircleCheckIcon, tone: 'success' },
  departed: { label: 'Departed', icon: LogOutIcon, tone: 'neutral' },
  cancelled: { label: 'Cancelled', icon: BanIcon, tone: 'neutral' },
  no_show: { label: 'No-show', icon: UserXIcon, tone: 'danger' },
  turned_away: { label: 'Turned away', icon: OctagonXIcon, tone: 'danger' },
};

export const SAFETY_STATUS: Record<SafetyStatus, StatusMeta> = {
  valid: { label: 'Briefing valid', icon: ShieldCheckIcon, tone: 'success' },
  missing: { label: 'Briefing missing', icon: ShieldAlertIcon, tone: 'danger' },
  expired: { label: 'Briefing expired', icon: ShieldXIcon, tone: 'danger' },
  invalidated: { label: 'Briefing outdated', icon: ShieldXIcon, tone: 'onsite' },
};

export const PUNCTUALITY: Record<Punctuality, StatusMeta> = {
  early: { label: 'Early', icon: TimerIcon, tone: 'neutral' },
  on_time: { label: 'On time', icon: ClockIcon, tone: 'success' },
  late: { label: 'Late', icon: AlarmClockIcon, tone: 'onsite' },
};

export const toneClasses: Record<Tone, string> = {
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
        sm: 'h-5 px-1.5 text-[11px] [&>svg]:size-3',
        md: 'h-6 px-2 text-xs [&>svg]:size-3.5',
        lg: 'h-8 px-2.5 text-sm [&>svg]:size-4',
        xl: 'h-11 px-3.5 text-base [&>svg]:size-5',
      },
    },
    defaultVariants: { size: 'md' },
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
}: { status: SafetyStatus } & Omit<StatusBadgeProps, 'meta'>) {
  return <StatusBadge meta={SAFETY_STATUS[status]} {...props} />;
}

export function PunctualityBadge({
  punctuality,
  minutes,
  ...props
}: { punctuality: Punctuality; minutes?: number } & Omit<StatusBadgeProps, 'meta' | 'label'>) {
  const meta = PUNCTUALITY[punctuality];
  const label =
    minutes === undefined || punctuality === 'on_time'
      ? meta.label
      : `${meta.label} ${punctuality === 'late' ? '+' : '-'}${minutes} min`;
  return <StatusBadge meta={meta} label={label} {...props} />;
}
