import type { MeResponse } from '@rampflow/shared/modules/core/api.auth';
import type { ContextSite } from '@rampflow/shared/modules/core/api.context';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronDownIcon, MonitorIcon } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from '@/components/shells/office-shell';
import { TabletShell } from '@/components/shells/tablet-shell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AreaAccess } from '@/lib/access';
import { useSiteTime } from '@/lib/time';
import { iconOf, NavIcon, useShellNav } from './nav';
import { UserMenuItems } from './user-menu';

// The station layout of gate and dock tablets (ADR-0011, "Station layout"): no sidebar, the site
// in `?site=`, the site clock, a live or offline pill, and a user menu with the other screens.

const lastSiteKey = (orgId: string) => `rf_station_site:${orgId}`;

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Whether the browser has a network; stations show "Offline" and disable actions without one. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

/**
 * The station's site: `?site=` when it names a site the user may see; otherwise the site this
 * device used last for the org, else the first allowed site, written back with `replace`.
 */
function useStationSite(orgId: string, sites: readonly ContextSite[]): ContextSite | undefined {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { site?: string };
  const inUrl = sites.find((s) => s.id === search.site);
  useEffect(() => {
    if (inUrl) {
      localStorage.setItem(lastSiteKey(orgId), inUrl.id);
      return;
    }
    const last = localStorage.getItem(lastSiteKey(orgId));
    const pick = sites.find((s) => s.id === last) ?? sites[0];
    if (pick) {
      void navigate({
        to: '.',
        search: ((prev: Record<string, unknown>) => ({ ...prev, site: pick.id })) as never,
        replace: true,
      });
    }
  }, [inUrl, orgId, sites, navigate]);
  return inUrl;
}

function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

export function StationShell({
  access,
  me,
  children,
}: {
  access: Extract<AreaAccess, { area: 'tenant' }>;
  me: MeResponse;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const nav = useShellNav(access);
  const { sites } = access.context;
  const site = useStationSite(access.orgId, sites);
  const online = useOnline();
  const now = useNow(15_000);
  const format = useSiteTime();
  const clock = site ? format(now, site.timeZone) : null;
  const station = nav.current;

  const siteMenu =
    sites.length > 1 ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" className="-ml-2 h-auto px-2 py-0.5 text-sm" />}
        >
          {site?.name ?? t(($) => $.shell.choose_site)}
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t(($) => $.shell.site)}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={site?.id ?? ''}
              onValueChange={(id) =>
                void navigate({
                  to: '.',
                  search: ((prev: Record<string, unknown>) => ({ ...prev, site: id })) as never,
                })
              }
            >
              {sites.map((s) => (
                <DropdownMenuRadioItem key={s.id} value={s.id}>
                  {s.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : undefined;

  const others = nav.items.filter((i) => i !== station);
  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="lg" data-testid="user-menu" />}>
        {me.user.name}
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <UserMenuItems me={me}>
          {others.length > 0 ? (
            <>
              <DropdownMenuGroup>
                {others.map((item) => (
                  <DropdownMenuItem key={item.href} render={<NavLink href={item.href} />}>
                    <NavIcon name={item.icon} />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
        </UserMenuItems>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <TabletShell
      station={station?.label ?? access.context.org.name}
      stationIcon={station ? iconOf(station.icon) : MonitorIcon}
      siteName={site?.name ?? ''}
      siteMenu={siteMenu}
      clock={clock?.time ?? '--:--'}
      zone={clock?.zone ?? ''}
      operator={me.user.name}
      userMenu={userMenu}
      online={online}
    >
      {children}
    </TabletShell>
  );
}
