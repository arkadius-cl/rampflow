import { useLocale } from '@/lib/i18n';
import { timeAt } from '@/lib/time';
import { cn } from '@/lib/utils';

/** "08:30 CET" in the site's zone, the zone label always shown (apps/web `SiteTime`). */
export function SiteTime({
  at,
  zone,
  className,
}: {
  at: string;
  zone: string;
  className?: string;
}) {
  const { time, zone: label } = timeAt(at, zone, useLocale());
  return (
    <time dateTime={at} className={cn('tabular-nums', className)}>
      {time}
      <span className="ml-1 text-[0.8em] font-medium text-muted-foreground">{label}</span>
    </time>
  );
}

export function SiteTimeRange({
  start,
  end,
  zone,
  className,
}: {
  start: string;
  end: string;
  zone: string;
  className?: string;
}) {
  const locale = useLocale();
  const from = timeAt(start, zone, locale);
  const to = timeAt(end, zone, locale);
  return (
    <span className={cn('tabular-nums', className)}>
      <time dateTime={start}>{from.time}</time>
      <span aria-hidden> – </span>
      <time dateTime={end}>{to.time}</time>
      <span className="ml-1 text-[0.8em] font-medium text-muted-foreground">{to.zone}</span>
    </span>
  );
}
