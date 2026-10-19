import type { Offers } from '@rampflow/shared/modules/booking/api.capacity';
import type { BoardView } from '@rampflow/shared/modules/booking/api.staff';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useSiteTime } from '@/lib/time';
import { cn } from '@/lib/utils';

// BK-02: the start times of a day for staff. Every open grid slot shows; the ones the capacity
// rules do not offer read "full" and need `booking.force` and a reason (UX concept, "Dispatcher
// plan board"). Lead time and horizon do not apply to staff, so the availability route's staff
// view already leaves them out.

export interface StartOption {
  startsAt: string;
  wallTime: string;
  fold: 'earlier' | 'later' | null;
  offered: boolean;
}

/** Open grid slots of the day (on `resourceIds` when given), marked with whether they are offered. */
export function startOptions(
  board: BoardView,
  offers: Offers | undefined,
  resourceIds?: readonly string[],
): StartOption[] {
  const offered = new Set(offers?.starts.map((s) => s.startsAt));
  const resources = board.resources.filter((r) => !resourceIds || resourceIds.includes(r.id));
  const grid = board.resources[0]?.slots ?? [];
  return grid.flatMap((slot, i) => {
    const open = resources.some((r) => (r.slots[i]?.capacity ?? 0) > 0);
    if (!open && !offered.has(slot.startsAt)) return [];
    return [{ ...slot, offered: offered.has(slot.startsAt) }];
  });
}

export function StartPicker({
  options,
  value,
  onChange,
  canForce,
  timeZone,
  labelledBy,
  invalid,
}: {
  options: StartOption[];
  /** Labels the two 02:30 of a DST fall-back day with their zone names. */
  timeZone: string;
  value: string;
  onChange: (startsAt: string) => void;
  canForce: boolean;
  labelledBy: string;
  invalid?: boolean;
}) {
  const { t } = useTranslation('booking');
  const siteTime = useSiteTime();
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{t(($) => $.plan.time.closed_day)}</p>;
  }
  return (
    <ToggleGroup
      value={value ? [value] : []}
      onValueChange={(v) => onChange(v[0] ?? '')}
      aria-labelledby={labelledBy}
      aria-invalid={invalid}
      className="flex flex-wrap justify-start gap-1.5"
      spacing={1}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.startsAt}
          value={o.startsAt}
          variant="outline"
          size="sm"
          disabled={!o.offered && !canForce}
          className={cn(
            'min-w-16 tabular-nums',
            !o.offered && 'border-dashed text-muted-foreground aria-pressed:text-foreground',
          )}
        >
          {o.wallTime}
          {o.fold === null ? null : (
            <span className="text-[11px]">{siteTime(o.startsAt, timeZone).zone}</span>
          )}
          {o.offered ? null : (
            <span className="text-[11px] font-normal">{t(($) => $.plan.time.full)}</span>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
