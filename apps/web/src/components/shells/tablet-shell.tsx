import { type LucideIcon, WifiIcon, WifiOffIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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
 * Gate and dock tablets: always light, large type, 44 px targets, glanceable
 * header with the station, site time and connectivity. Dark mode is off here
 * on purpose: the devices sit in daylight and the colour tokens are tuned for
 * white surfaces.
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
  return (
    <div
      data-density="touch"
      className={cn('flex min-h-svh flex-col bg-canvas text-foreground', className)}
    >
      <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-background px-5">
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
            <div className="text-2xl font-semibold tabular-nums">
              {clock} <span className="text-base font-medium text-muted-foreground">{zone}</span>
            </div>
            <div className="text-xs text-muted-foreground">{t(($) => $.shell.site_time)}</div>
          </div>
          <div
            role="status"
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium',
              online
                ? 'border-tone-success-border bg-tone-success-bg text-tone-success'
                : 'border-tone-danger-border bg-tone-danger-bg text-tone-danger',
            )}
          >
            {online ? <WifiIcon className="size-4" /> : <WifiOffIcon className="size-4" />}
            {online ? t(($) => $.shell.live) : t(($) => $.shell.offline)}
          </div>
          {userMenu ?? (
            <Button variant="outline" size="lg">
              {operator}
            </Button>
          )}
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
      <main className="flex min-h-0 flex-1 flex-col gap-4 p-5">{children}</main>
    </div>
  );
}
