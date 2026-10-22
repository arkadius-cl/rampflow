import { Density } from '@rampflow/shared/values';
import { type LucideIcon, WifiIcon, WifiOffIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useDensity } from '@/hooks/use-density';
import { cn } from '@/lib/utils';

export interface TabletShellProps {
  /** Station label, for example "Gate" or "Docks". */
  station: string;
  stationIcon: LucideIcon | ComponentType<{ className?: string }>;
  siteName: string;
  /** Replaces the site name with a site picker. */
  siteMenu?: React.ReactNode;
  /** Site-local clock and zone, for example "10:42" and "CET". */
  clock: string;
  zone: string;
  operator: string;
  /** Replaces the operator button with a menu (other stations, language, sign out). */
  userMenu?: React.ReactNode;
  online?: boolean;
  /** Tabs or filters rendered under the title row. */
  toolbar?: React.ReactNode;
  /** A band under the header that renders nothing when empty, for example a setup notice. */
  notice?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Gate and dock tablets in the hall density (ADR-0021): 56 px targets, one 72 px primary action,
 * 18 px type, no hover, a glanceable header with the station, site time and connectivity. The
 * device chooses light or dark in its menu; light is the default in daylight.
 */
export function TabletShell({
  station,
  stationIcon: StationIcon,
  siteName,
  siteMenu,
  clock,
  zone,
  operator,
  userMenu,
  online = true,
  toolbar,
  notice,
  children,
  className,
}: TabletShellProps) {
  const { t } = useTranslation();
  useDensity(Density.halle);
  return (
    <div
      data-density={Density.halle}
      className={cn('flex min-h-svh flex-col bg-canvas text-foreground', className)}
    >
      <header className="flex min-h-16 shrink-0 items-center gap-4 border-b bg-background px-pad py-2">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <StationIcon className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="text-lg font-semibold">{station}</div>
            {siteMenu ?? <div className="text-sm text-muted-foreground">{siteName}</div>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-5">
          <div className="text-right leading-tight">
            <div className="text-xl font-semibold tabular-nums">
              {clock} <span className="text-base font-medium text-muted-foreground">{zone}</span>
            </div>
            <div className="text-xs text-muted-foreground">{t(($) => $.shell.site_time)}</div>
          </div>
          <div
            role="status"
            className={cn(
              'flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm font-medium',
              online
                ? 'bg-tone-success-bg text-tone-success'
                : 'bg-tone-danger-bg text-tone-danger',
            )}
          >
            {online ? <WifiIcon className="size-4" /> : <WifiOffIcon className="size-4" />}
            {online ? t(($) => $.shell.live) : t(($) => $.shell.offline)}
          </div>
          {userMenu ?? <Button variant="outline">{operator}</Button>}
        </div>
      </header>
      {notice ? (
        <div className="shrink-0 bg-background px-5 py-2 empty:hidden">{notice}</div>
      ) : null}
      {toolbar ? (
        <div className="flex shrink-0 items-center gap-3 border-b bg-background px-5 py-3">
          {toolbar}
        </div>
      ) : null}
      <main className="flex min-h-0 flex-1 flex-col gap-gap p-pad">{children}</main>
    </div>
  );
}
