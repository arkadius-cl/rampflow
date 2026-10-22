import type { UsageMeter } from '@rampflow/shared/modules/core/api.platform';
import { UiSize } from '@rampflow/shared/values';
import { TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useFormat } from './format';

/**
 * Usage against a limit (PL-04). Over the limit shows an icon and words, not colour alone. `sm` is
 * the table cell: 4rem wide, the percentage only for screen readers, the icon when over.
 */
export function Meter({
  meter,
  label,
  size = UiSize.md,
}: {
  meter: UsageMeter;
  label: string;
  size?: typeof UiSize.sm | typeof UiSize.md;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const used = format.number(meter.used);
  if (meter.limit === null) {
    return (
      <span className="tabular-nums">
        {used} <span className="text-muted-foreground">/ {t(($) => $.platform.unlimited)}</span>
      </span>
    );
  }
  const percent =
    meter.limit > 0 ? Math.round((meter.used / meter.limit) * 100) : meter.over ? 100 : 0;
  return (
    <div className={cn('flex flex-col gap-1', size === UiSize.sm ? 'w-fit min-w-14' : 'min-w-28')}>
      <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
        <span>
          {used} <span className="text-muted-foreground">/ {format.number(meter.limit)}</span>
        </span>
        <span
          className={cn(
            'flex items-center gap-1',
            meter.over
              ? 'font-semibold text-tone-danger'
              : percent >= 90
                ? 'text-tone-onsite'
                : 'text-muted-foreground',
          )}
        >
          {meter.over ? <TriangleAlertIcon className="size-3" aria-hidden /> : null}
          <span className={size === UiSize.sm ? 'sr-only' : undefined}>
            {meter.over
              ? meter.soft
                ? t(($) => $.platform.over_soft, { percent })
                : t(($) => $.platform.over_hard, { percent })
              : t(($) => $.platform.percent, { percent })}
          </span>
        </span>
      </div>
      <Progress
        value={Math.min(percent, 100)}
        aria-label={t(($) => $.platform.meter_label, { label, percent })}
      />
    </div>
  );
}
