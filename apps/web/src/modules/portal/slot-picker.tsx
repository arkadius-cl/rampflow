import type { OfferedStart } from '@rampflow/shared/modules/booking/api.capacity';
import type { LocalDate } from '@rampflow/shared/time';
import { StaffLocale } from '@rampflow/shared/values';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLocale } from '@/lib/i18n';
import { useSiteTime } from '@/lib/time';
import { cn } from '@/lib/utils';

// BK-04: the prototype's slot picker (components/slot-picker.tsx) with catalog strings and the
// API's offers: a day strip with the number of offered starts, then the offered start times of
// the chosen day grouped morning and afternoon. Times the rules do not offer never show.

export interface PickerDay {
  date: LocalDate;
  /** Offered starts on that day; `undefined` while loading. */
  count: number | undefined;
}

export function PortalSlotPicker({
  days,
  date,
  onDate,
  starts,
  value,
  onChange,
  timeZone,
  durationMinutes,
  onPrevious,
  onNext,
}: {
  days: PickerDay[];
  date: LocalDate | null;
  onDate: (date: LocalDate) => void;
  starts: OfferedStart[] | undefined;
  value: string | null;
  onChange: (startsAt: string) => void;
  timeZone: string;
  durationMinutes: number | undefined;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const { t } = useTranslation('booking');
  const locale = useLocale();
  const siteTime = useSiteTime();
  const tag = locale === StaffLocale.en ? 'en-GB' : locale;
  const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' });
  const dayNumber = new Intl.DateTimeFormat(tag, { day: 'numeric', timeZone: 'UTC' });
  const longDay = new Intl.DateTimeFormat(tag, { dateStyle: 'full', timeZone: 'UTC' });
  const at = (d: LocalDate) => new Date(`${d}T00:00:00Z`);
  const zone = starts?.[0] ? siteTime(starts[0].startsAt, timeZone).zone : null;
  const groups = [
    {
      label: t(($) => $.portal.slot.morning),
      options: (starts ?? []).filter((s) => Number(s.wallTime.slice(0, 2)) < 12),
    },
    {
      label: t(($) => $.portal.slot.afternoon),
      options: (starts ?? []).filter((s) => Number(s.wallTime.slice(0, 2)) >= 12),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onPrevious}
          disabled={!onPrevious}
          aria-label={t(($) => $.portal.slot.previous_week)}
        >
          <ChevronLeftIcon />
        </Button>
        <fieldset className="grid flex-1 grid-cols-7 gap-1.5">
          <legend className="sr-only">{t(($) => $.portal.slot.day)}</legend>
          {days.map((d) => {
            const active = d.date === date;
            const closed = d.count === 0;
            return (
              <button
                key={d.date}
                type="button"
                aria-pressed={active}
                aria-label={`${longDay.format(at(d.date))}: ${
                  d.count === undefined
                    ? t(($) => $.portal.slot.loading)
                    : t(($) => $.portal.slot.free, { count: d.count })
                }`}
                disabled={closed}
                onClick={() => onDate(d.date)}
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
                  {weekday.format(at(d.date))}
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {dayNumber.format(at(d.date))}
                </span>
                <span className={cn('text-[11px]', !active && 'text-muted-foreground')}>
                  {d.count === undefined ? (
                    <Skeleton className="h-3 w-8" />
                  ) : closed ? (
                    t(($) => $.portal.slot.none)
                  ) : (
                    t(($) => $.portal.slot.free, { count: d.count })
                  )}
                </span>
              </button>
            );
          })}
        </fieldset>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onNext}
          disabled={!onNext}
          aria-label={t(($) => $.portal.slot.next_week)}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {zone ? (
            <>
              {t(($) => $.portal.slot.zone)}{' '}
              <span className="font-medium text-foreground">{zone}</span>
            </>
          ) : null}
        </span>
        {durationMinutes === undefined ? null : (
          <span>{t(($) => $.portal.slot.duration, { minutes: durationMinutes })}</span>
        )}
      </div>

      {date === null ? (
        <p className="text-sm text-muted-foreground">{t(($) => $.portal.slot.pick_day)}</p>
      ) : starts === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : starts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t(($) => $.portal.slot.no_times)}</p>
      ) : (
        groups.map(({ label, options }) =>
          options.length === 0 ? null : (
            <fieldset key={label} className="flex flex-col gap-2">
              <legend className="mb-2 text-xs font-medium text-muted-foreground">{label}</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {options.map((s) => {
                  const active = s.startsAt === value;
                  return (
                    <button
                      key={s.startsAt}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange(s.startsAt)}
                      className={cn(
                        'flex h-11 items-center justify-center gap-1 rounded-lg border text-sm font-semibold tabular-nums outline-none transition-colors',
                        'focus-visible:ring-3 focus-visible:ring-ring/50',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted',
                      )}
                    >
                      {active ? <CheckIcon className="size-3.5" aria-hidden /> : null}
                      {s.wallTime}
                      {s.fold === null ? null : (
                        <span className="text-[11px] font-normal">
                          {siteTime(s.startsAt, timeZone).zone}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ),
        )
      )}
    </div>
  );
}
