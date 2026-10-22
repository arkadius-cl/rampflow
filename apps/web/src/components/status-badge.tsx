import { type BookingStatus, Punctuality } from '@rampflow/shared/modules/booking/values';
import type { BriefingState } from '@rampflow/shared/modules/safety/values';
import { BadgeSize, BadgeTone } from '@rampflow/shared/values';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  ArrowDownToLineIcon,
  BanIcon,
  CalendarCheckIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleMinusIcon,
  ClockIcon,
  ForkliftIcon,
  LogOutIcon,
  type LucideIcon,
  MapPinIcon,
  MegaphoneIcon,
  PackageOpenIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  UserXIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  tone: BadgeTone;
  /** Surface and text classes when the tone's tokens are not the right ones (punctuality). */
  className?: string;
  /** Struck through, like "storniert" in the design. */
  strike?: boolean;
}

// One registry per status family. Status is never conveyed by colour alone: every badge renders
// icon + label, and the tone only reinforces it. Icons and tones follow the yrd design system
// (design/yrd/components/status/StatusBadge.jsx): amber waits, blue is active, green is done, red
// is a problem, grey is over.
export const BOOKING_STATUS: Record<BookingStatus, StatusMeta> = {
  requested: { label: 'Requested', icon: ClockIcon, tone: BadgeTone.onsite },
  confirmed: { label: 'Confirmed', icon: CalendarCheckIcon, tone: BadgeTone.planned },
  checked_in: { label: 'Checked in', icon: MapPinIcon, tone: BadgeTone.onsite },
  called: { label: 'Called', icon: MegaphoneIcon, tone: BadgeTone.active },
  at_dock: { label: 'At dock', icon: ForkliftIcon, tone: BadgeTone.active },
  loading: { label: 'Loading', icon: PackageOpenIcon, tone: BadgeTone.active },
  done: { label: 'Done', icon: CircleCheckIcon, tone: BadgeTone.success },
  departed: { label: 'Departed', icon: LogOutIcon, tone: BadgeTone.neutral },
  cancelled: { label: 'Cancelled', icon: CircleMinusIcon, tone: BadgeTone.neutral, strike: true },
  no_show: { label: 'No-show', icon: UserXIcon, tone: BadgeTone.danger },
  turned_away: { label: 'Turned away', icon: BanIcon, tone: BadgeTone.danger },
};

export const SAFETY_STATUS: Record<BriefingState, StatusMeta> = {
  valid: { label: 'Briefing valid', icon: ShieldCheckIcon, tone: BadgeTone.success },
  missing: { label: 'Briefing missing', icon: ShieldAlertIcon, tone: BadgeTone.danger },
  expired: { label: 'Briefing expired', icon: ShieldXIcon, tone: BadgeTone.danger },
  outdated: { label: 'Briefing outdated', icon: ShieldXIcon, tone: BadgeTone.onsite },
};

/** Punctuality has its own tokens (design "Pünktlichkeit"); the tone only names the nearest meaning. */
export const PUNCTUALITY: Record<Punctuality, StatusMeta> = {
  early: {
    label: 'Early',
    icon: ArrowDownToLineIcon,
    tone: BadgeTone.neutral,
    className: 'bg-punctual-early text-punctual-early-foreground',
  },
  on_time: {
    label: 'On time',
    icon: CheckIcon,
    tone: BadgeTone.success,
    className: 'bg-punctual-on-time text-punctual-on-time-foreground',
  },
  late: {
    label: 'Late',
    icon: CircleAlertIcon,
    tone: BadgeTone.danger,
    className: 'bg-punctual-late text-punctual-late-foreground',
  },
};

/** Surface and text of a tone; the badge draws no border, like the design's StatusBadge. */
export const toneClasses: Record<BadgeTone, string> = {
  planned: 'bg-tone-planned-bg text-tone-planned',
  onsite: 'bg-tone-onsite-bg text-tone-onsite',
  active: 'bg-tone-active-bg text-tone-active',
  success: 'bg-tone-success-bg text-tone-success',
  danger: 'bg-tone-danger-bg text-tone-danger',
  neutral: 'bg-tone-neutral-bg text-tone-neutral',
};

/** The solid of a tone, for dots, timeline blocks and dock lanes. */
export const toneSolidClasses: Record<BadgeTone, string> = {
  planned: 'bg-tone-planned-solid',
  onsite: 'bg-tone-onsite-solid',
  active: 'bg-tone-active-solid',
  success: 'bg-tone-success-solid',
  danger: 'bg-tone-danger-solid',
  neutral: 'bg-tone-neutral-solid',
};

const statusBadgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-sm font-medium',
  {
    variants: {
      size: {
        [BadgeSize.sm]: 'h-5 gap-1 px-1.5 text-xs [&>svg]:size-3',
        [BadgeSize.md]: 'h-6 gap-1.5 px-2 text-sm [&>svg]:size-3.5',
        [BadgeSize.lg]: 'h-10 gap-2 px-3.5 text-md [&>svg]:size-5',
        [BadgeSize.xl]: 'h-11 gap-2 px-3.5 text-md [&>svg]:size-6',
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
      className={cn(
        statusBadgeVariants({ size }),
        meta.className ?? toneClasses[meta.tone],
        meta.strike && 'line-through decoration-1',
        className,
      )}
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
