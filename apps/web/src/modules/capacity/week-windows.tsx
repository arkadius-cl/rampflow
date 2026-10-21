import type { HoursRow } from '@rampflow/shared/time/weekly-hours';
import { ZodIssueCode } from '@rampflow/shared/values';
import { PlusIcon, XIcon } from 'lucide-react';
import {
  type Control,
  Controller,
  type FieldError,
  type FieldValues,
  get,
  type Path,
  type UseFieldArrayProps,
  useFieldArray,
  useFormState,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, FieldError as FieldErrorText } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useIssueText } from './form';
import { weekdayName } from './time';

// MD-01, MD-04: the week of opening windows, several per day, edited in place. The hours tab and
// the "New site" form both hold the rows in a field array of their own form.

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

type Part = keyof Pick<HoursRow, 'opens' | 'closes'>;

export function WeekWindowsField<T extends FieldValues>({
  control,
  name,
  readOnly = false,
  label,
}: {
  control: Control<T>;
  /** A field of `HoursRow` items. */
  name: UseFieldArrayProps<T>['name'];
  /** Lists the windows as text, for a template the admin confirms. */
  readOnly?: boolean;
  /** Names the read-only list. */
  label?: string;
}) {
  const { t } = useTranslation('booking');
  const locale = useLocale();
  const message = useIssueText();
  const windows = useFieldArray({ control, name });
  const { errors } = useFormState({ control });
  // The caller's field holds HoursRow items; RHF cannot resolve paths and items of a generic
  // form, so the three casts below name what the `name` prop promises.
  const rows = windows.fields as unknown as (HoursRow & { id: string })[];
  const at = (index: number, part: Part) => `${name}.${index}.${part}` as Path<T>;
  const errorAt = (index: number): FieldError | undefined => {
    const err = get(errors, `${name}.${index}`);
    return err?.closes ?? err?.opens ?? (err?.type ? err : undefined);
  };
  const list = get(errors, name);
  // zodResolver nests an issue on the array itself under `root` once the field array registered.
  const listError: FieldError | undefined = list?.root ?? (list?.type ? list : undefined);

  const time = (index: number, part: Part, label: string) => (
    <Controller
      name={at(index, part)}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className="w-24">
          <Input
            {...field}
            aria-label={label}
            inputMode="numeric"
            placeholder="HH:MM"
            aria-invalid={fieldState.invalid}
          />
        </Field>
      )}
    />
  );

  if (readOnly) return <WeekHoursList rows={rows} label={label} />;

  return (
    <div className="flex flex-col gap-2">
      <div className="divide-y rounded-lg border">
        {WEEKDAYS.map((weekday) => {
          const day = weekdayName(weekday, locale);
          const entries = rows
            .map((f, index) => ({ f, index }))
            .filter(({ f }) => f.weekday === weekday);
          return (
            <div key={weekday} className="flex flex-wrap items-start gap-3 px-3 py-2">
              <div className="w-28 pt-1.5 text-sm font-medium">{day}</div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {entries.length === 0 ? (
                  <span className="pt-1.5 text-sm text-muted-foreground">
                    {t(($) => $.capacity.hours.closed)}
                  </span>
                ) : null}
                {entries.map(({ f, index }) => {
                  const issue = errorAt(index);
                  return (
                    <div key={f.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {time(
                          index,
                          'opens',
                          t(($) => $.capacity.hours.opens_on, { day }),
                        )}
                        <span aria-hidden>–</span>
                        {time(
                          index,
                          'closes',
                          t(($) => $.capacity.hours.closes_on, { day }),
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t(($) => $.capacity.hours.remove_window, { day })}
                          onClick={() => windows.remove(index)}
                        >
                          <XIcon />
                        </Button>
                      </div>
                      {issue ? <FieldErrorText>{message(issue)}</FieldErrorText> : null}
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t(($) => $.capacity.hours.add_window_on, { day })}
                onClick={() =>
                  windows.append({ weekday, opens: '08:00', closes: '16:00' } as never)
                }
              >
                <PlusIcon /> {t(($) => $.capacity.hours.add_window)}
              </Button>
            </div>
          );
        })}
      </div>
      {listError ? (
        <FieldErrorText>
          {listError.type === ZodIssueCode.too_big
            ? t(($) => $.capacity.hours.too_many)
            : t(($) => $.capacity.hours.none_open)}
        </FieldErrorText>
      ) : null}
      <p className="text-xs text-muted-foreground">{t(($) => $.capacity.hours.midnight_hint)}</p>
    </div>
  );
}

/** The windows of each weekday as text, "Closed" for a day without one. */
export function WeekHoursList({
  rows,
  label,
}: {
  rows: readonly Pick<HoursRow, 'weekday' | 'opens' | 'closes'>[];
  label?: string;
}) {
  const { t } = useTranslation('booking');
  const locale = useLocale();
  return (
    <dl
      aria-label={label}
      className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm"
    >
      {WEEKDAYS.map((weekday) => {
        const day = rows.filter((r) => r.weekday === weekday);
        return (
          <div key={weekday} className="contents">
            <dt className="font-medium">{weekdayName(weekday, locale)}</dt>
            <dd className={cn(day.length === 0 && 'text-muted-foreground')}>
              {day.length === 0
                ? t(($) => $.capacity.hours.closed)
                : day.map((r) => `${r.opens}–${r.closes}`).join(', ')}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
