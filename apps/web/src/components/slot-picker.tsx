import { SlotAvailability } from '@rampflow/shared/modules/booking/values';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SlotState = SlotAvailability;

export interface SlotDay {
  date: string;
  weekday: string;
  dayOfMonth: string;
  /** Reason the day offers no slots, for example "Public holiday". */
  closedReason?: string;
  freeCount: number;
}

export interface SlotOption {
  time: string;
  state: SlotState;
  /** Free capacity units in this slot. */
  free: number;
}

export interface SlotPickerProps {
  days: SlotDay[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  slots: SlotOption[];
  selectedTime?: string;
  onSelectTime: (time: string) => void;
  zone: string;
  /** Viewer's zone when it differs, shown once as a hint. */
  viewerZoneHint?: string;
  durationLabel: string;
}

const slotStateLabel: Record<SlotState, string> = {
  free: 'free',
  scarce: 'left',
  full: 'full',
  closed: 'closed',
};

/**
 * Day strip plus start-time chips. Custom because the calendar component
 * cannot show per-slot capacity, and the picker must hide times that violate
 * hours, closures, lead time and horizon rather than grey out a whole day.
 */
export function SlotPicker({
  days,
  selectedDate,
  onSelectDate,
  slots,
  selectedTime,
  onSelectTime,
  zone,
  viewerZoneHint,
  durationLabel,
}: SlotPickerProps) {
  const groups = [
    { label: 'Morning', options: slots.filter((s) => Number(s.time.slice(0, 2)) < 12) },
    { label: 'Afternoon', options: slots.filter((s) => Number(s.time.slice(0, 2)) >= 12) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid grid-cols-7 gap-1.5">
        <legend className="sr-only">Day</legend>
        {days.map((d) => {
          const active = d.date === selectedDate;
          const closed = d.closedReason !== undefined;
          return (
            <button
              key={d.date}
              type="button"
              aria-pressed={active}
              disabled={closed}
              onClick={() => onSelectDate(d.date)}
              title={d.closedReason}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg border py-2 text-sm outline-none transition-colors',
                'focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-muted',
                closed && 'cursor-not-allowed border-dashed opacity-50 hover:bg-background',
              )}
            >
              <span className={cn('text-[11px] uppercase', !active && 'text-muted-foreground')}>
                {d.weekday}
              </span>
              <span className="text-lg font-semibold tabular-nums">{d.dayOfMonth}</span>
              <span className={cn('text-[11px]', !active && 'text-muted-foreground')}>
                {closed ? 'closed' : `${d.freeCount} free`}
              </span>
            </button>
          );
        })}
      </fieldset>

      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">
          Start times in <span className="font-medium text-foreground">{zone}</span>
          {viewerZoneHint ? ` · ${viewerZoneHint}` : ''}
        </span>
        <span className="text-muted-foreground">Duration {durationLabel}</span>
      </div>

      {groups.map(({ label, options }) =>
        options.length === 0 ? null : (
          <div key={label} className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <fieldset className="grid grid-cols-4 gap-2">
              <legend className="sr-only">{label}</legend>
              {options.map((s) => {
                const active = s.time === selectedTime;
                const disabled =
                  s.state === SlotAvailability.full || s.state === SlotAvailability.closed;
                return (
                  <button
                    key={s.time}
                    type="button"
                    aria-pressed={active}
                    disabled={disabled}
                    onClick={() => onSelectTime(s.time)}
                    className={cn(
                      'flex h-12 flex-col items-center justify-center rounded-lg border text-sm outline-none transition-colors',
                      'focus-visible:ring-3 focus-visible:ring-ring/50',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted',
                      disabled &&
                        'cursor-not-allowed bg-muted/60 text-muted-foreground hover:bg-muted/60',
                    )}
                  >
                    <span className="flex items-center gap-1 font-semibold tabular-nums">
                      {active ? <CheckIcon className="size-3.5" /> : null}
                      {s.time}
                    </span>
                    <span
                      className={cn(
                        'text-[11px]',
                        active
                          ? 'text-primary-foreground'
                          : s.state === SlotAvailability.scarce
                            ? 'text-tone-onsite'
                            : 'text-muted-foreground',
                      )}
                    >
                      {s.state === SlotAvailability.full || s.state === SlotAvailability.closed
                        ? slotStateLabel[s.state]
                        : `${s.free} ${slotStateLabel[s.state]}`}
                    </span>
                  </button>
                );
              })}
            </fieldset>
          </div>
        ),
      )}
    </div>
  );
}
