import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface SiteTimeProps extends React.ComponentProps<'time'> {
  /** Site-local wall clock, HH:mm. */
  time: string;
  /** Zone abbreviation shown next to every time, for example CET. */
  zone: string;
  /** Viewer's own wall clock when it differs from site time. */
  viewerTime?: string;
}

/** Renders "08:30 CET" and, for viewers in another zone, "(07:30 your time)" in their language. */
export function SiteTime({ time, zone, viewerTime, className, ...props }: SiteTimeProps) {
  const { t } = useTranslation();
  return (
    <time className={cn('tabular-nums', className)} {...props}>
      {time}
      <span className="ml-1 text-[0.8em] font-medium text-muted-foreground">{zone}</span>
      {viewerTime ? (
        <span className="ml-1 text-[0.8em] text-muted-foreground">
          {t(($) => $.shell.viewer_time, { time: viewerTime })}
        </span>
      ) : null}
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
  return (
    <span className={cn('tabular-nums', className)}>
      {start}
      <span aria-hidden> – </span>
      <span className="sr-only">to</span>
      {end}
      <span className="ml-1 text-[0.8em] font-medium text-muted-foreground">{zone}</span>
    </span>
  );
}
