import type { BookingSafety } from '@rampflow/shared/modules/booking/api.staff';
import type { BookingStatus } from '@rampflow/shared/modules/booking/lifecycle';
import { BookingFlag, Punctuality } from '@rampflow/shared/modules/booking/values';
import type { LocalDate } from '@rampflow/shared/time';
import { BadgeTone, StaffLocale, values } from '@rampflow/shared/values';
import { FootprintsIcon, ShieldIcon, TriangleAlertIcon, ZapIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  BOOKING_STATUS,
  PUNCTUALITY,
  SAFETY_STATUS,
  StatusBadge,
  type StatusBadgeProps,
  type StatusMeta,
} from '@/components/status-badge';
import { useLocale } from '@/lib/i18n';

// Status badges of the booking screens: the prototype registry's icons and tones with labels
// from the catalogs. Every status is icon plus label (UX concept, principle 2).

type BadgeProps = Omit<StatusBadgeProps, 'meta'>;
type Look = Omit<StatusMeta, 'label'>;

export function BookingStatusBadge({ status, ...props }: { status: BookingStatus } & BadgeProps) {
  const { t } = useTranslation('booking');
  return (
    <StatusBadge
      meta={{ ...BOOKING_STATUS[status], label: t(($) => $.lifecycle.status[status]) }}
      {...props}
    />
  );
}

const SAFETY_LOOK: Record<BookingSafety['status'], Look> = {
  valid: SAFETY_STATUS.valid,
  missing: SAFETY_STATUS.missing,
  not_required: { icon: ShieldIcon, tone: BadgeTone.neutral },
};

export function BookingSafetyBadge({
  status,
  ...props
}: { status: BookingSafety['status'] } & BadgeProps) {
  const { t } = useTranslation('booking');
  return (
    <StatusBadge
      meta={{ ...SAFETY_LOOK[status], label: t(($) => $.plan.safety[status]) }}
      {...props}
    />
  );
}

export function PunctualityBadge({
  punctuality,
  minutes,
  ...props
}: { punctuality: Punctuality; minutes: number | null } & BadgeProps) {
  const { t } = useTranslation('booking');
  const label = t(($) => $.lifecycle.punctuality[punctuality]);
  return (
    <StatusBadge
      meta={{ ...PUNCTUALITY[punctuality], label }}
      label={
        minutes === null || punctuality === Punctuality.on_time
          ? label
          : t(($) => $.plan.punctuality_minutes, {
              label,
              minutes: `${punctuality === Punctuality.late ? '+' : '-'}${Math.abs(minutes)}`,
            })
      }
      {...props}
    />
  );
}

const FLAG_LOOK: Record<BookingFlag, Look> = {
  forced: { icon: ZapIcon, tone: BadgeTone.onsite },
  walkIn: { icon: FootprintsIcon, tone: BadgeTone.neutral },
  overCapacity: { icon: TriangleAlertIcon, tone: BadgeTone.danger },
};

/** The flags a booking carries, in display order. */
export const flagsOf = (b: { forced: boolean; walkIn: boolean; overCapacity?: boolean }) =>
  values(BookingFlag).filter((f) => b[f] === true);

export function BookingFlagBadge({ flag, ...props }: { flag: BookingFlag } & BadgeProps) {
  const { t } = useTranslation('booking');
  return (
    <StatusBadge
      meta={{ ...FLAG_LOOK[flag], label: t(($) => $.lifecycle.flag[flag]) }}
      {...props}
    />
  );
}

/** "Mon 2 Nov 2026" in the UI language. A local date has no zone, so it formats as UTC. */
export function useDayLabel() {
  const locale = useLocale();
  // en reads "Mon 19 Oct 2026" as in the UX concept, not the US order.
  const format = new Intl.DateTimeFormat(locale === StaffLocale.en ? 'en-GB' : locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (day: LocalDate) => format.format(new Date(`${day}T00:00:00Z`));
}

/** A load type's name in the UI language; the API stores de and en (MD-05). */
export function useLoadTypeName() {
  const locale = useLocale();
  return (name: { de: string; en: string }) => (locale === StaffLocale.de ? name.de : name.en);
}
