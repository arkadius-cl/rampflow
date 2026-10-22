import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import { SafetyStatus } from '@rampflow/shared/modules/safety/values';
import type { OnSiteTruck, YardTruck } from '@rampflow/shared/modules/yard/api';
import { GateTab } from '@rampflow/shared/modules/yard/values';
import {
  BadgeSize,
  BadgeTone,
  Feature,
  isValueOf,
  Permission,
  ShellLayout,
  values,
} from '@rampflow/shared/values';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  BellRingIcon,
  LogInIcon,
  LogOutIcon,
  OctagonXIcon,
  ScanLineIcon,
  SearchIcon,
  TimerIcon,
  TruckIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnline } from '@/components/app-shell/station-shell';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { guard, useAccess } from '@/lib/access';
import { cn } from '@/lib/utils';
import { OnboardingGate } from '@/modules/core/onboarding';
import { CallDialog } from '@/modules/yard/call-dialog';
import { CheckInDialog } from '@/modules/yard/check-in-dialog';
import { CheckOutDialog } from '@/modules/yard/check-out-dialog';
import { expectedQuery, onSiteQuery, searchQuery } from '@/modules/yard/queries';
import { stationSearch, useStationSite } from '@/modules/yard/station';
import {
  InstantTime,
  SlotRange,
  TruckPunctuality,
  TruckSafety,
  TruckStatus,
  useLoadTypeName,
} from '@/modules/yard/truck-parts';
import { WalkInDialog } from '@/modules/yard/walk-in-dialog';

// Gate station (YD-01 to YD-05): expected trucks, scanner search, check-in, walk-in, turn away,
// the on-site list and check-out. Station layout: no sidebar, the site in `?site=`.

interface GateSearch {
  site?: string;
  tab?: GateTab;
  checkin?: string;
  walkin?: 1;
}

export const Route = createFileRoute('/t/$orgId/gate/')({
  staticData: { shell: ShellLayout.station },
  beforeLoad: guard({ permission: Permission.yard.gate }),
  validateSearch: (search: Record<string, unknown>): GateSearch => ({
    ...stationSearch(search),
    tab: isValueOf(GateTab, search.tab) ? search.tab : undefined,
    checkin: typeof search.checkin === 'string' ? search.checkin : undefined,
    // biome-ignore lint/plugin: the flag as a number or as the string a typed URL gives, not a value set
    walkin: search.walkin === 1 || search.walkin === '1' ? 1 : undefined,
  }),
  component: GateScreen,
});

const EXPECTED = new Set<YardTruck['status']>([BookingStatus.confirmed, BookingStatus.no_show]);
const DEPARTED = new Set<YardTruck['status']>([BookingStatus.departed, BookingStatus.turned_away]);

function GateScreen() {
  const site = useStationSite();
  if (!site) return null;
  return <Gate siteId={site.id} />;
}

function Gate({ siteId }: { siteId: string }) {
  const { t } = useTranslation('yard');
  const { t: tc } = useTranslation();
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const online = useOnline();
  const access = useAccess();
  const expected = useQuery(expectedQuery(orgId, siteId));
  const onSite = useQuery(onSiteQuery(orgId, siteId));
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const found = useQuery(searchQuery(orgId, siteId, q));
  const [checkOutId, setCheckOut] = useState<string>();
  const [callingId, setCalling] = useState<string>();
  // A scanned booking may lie outside today's lists (an early truck); the dialog still needs it.
  const [scanned, setScanned] = useState<YardTruck>();
  const tab = search.tab ?? GateTab.expected;
  const canCall = access.can(Permission.yard.call) && access.has(Feature.yard.call_to_dock);

  const day = expected.data?.items ?? [];
  const lists: Record<GateTab, (YardTruck | OnSiteTruck)[]> = {
    expected: day.filter((b) => EXPECTED.has(b.status)),
    onsite: onSite.data?.items ?? [],
    departed: day.filter((b) => DEPARTED.has(b.status)),
  };
  const all = [
    ...lists.onsite,
    ...day,
    ...(found.data?.items ?? []),
    ...(scanned ? [scanned] : []),
  ];
  const byId = (id: string | undefined) => (id ? all.find((b) => b.id === id) : undefined);
  const dialogTruck = byId(search.checkin);
  const checkOut = byId(checkOutId);
  const calling = byId(callingId);

  const setSearch = (next: Partial<GateSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...next }) });

  // A scanner types the booking code and Enter: an exact code match opens its check-in.
  useEffect(() => {
    const items = found.data?.items;
    if (!items || q === '') return;
    const exact = items.find((b) => b.code === q.trim().toUpperCase());
    if (exact) {
      setScanned(exact);
      setInput('');
      setQ('');
      void navigate({ search: (prev) => ({ ...prev, checkin: exact.id }) });
    }
  }, [found.data, q, navigate]);

  const asOf = expected.dataUpdatedAt ? new Date(expected.dataUpdatedAt) : null;
  const shown = q !== '' ? (found.data?.items ?? []) : lists[tab];

  return (
    <>
      <div className="-mx-5 -mt-5 flex flex-wrap items-center gap-3 border-b bg-background px-5 py-3">
        <search className="max-w-xl flex-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQ(input.trim());
            }}
          >
            <InputGroup className="text-base">
              <InputGroupAddon>
                <ScanLineIcon className="size-5" />
              </InputGroupAddon>
              <InputGroupInput
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t(($) => $.gate.search.placeholder)}
                aria-label={t(($) => $.gate.search.label)}
                className="text-base"
                autoComplete="off"
              />
              <InputGroupAddon align="inline-end">
                {q !== '' ? (
                  <InputGroupButton
                    className="size-control-sm"
                    aria-label={t(($) => $.gate.search.clear)}
                    onClick={() => {
                      setInput('');
                      setQ('');
                    }}
                  >
                    <XIcon className="size-5" />
                  </InputGroupButton>
                ) : (
                  <InputGroupButton
                    className="size-control-sm"
                    type="submit"
                    aria-label={t(($) => $.gate.search.label)}
                  >
                    <SearchIcon className="size-5" />
                  </InputGroupButton>
                )}
              </InputGroupAddon>
            </InputGroup>
          </form>
        </search>
        <Tabs
          value={tab}
          onValueChange={(value) => setSearch({ tab: value as GateTab })}
          className="ml-auto"
        >
          <TabsList>
            {values(GateTab).map((id) => (
              <TabsTrigger key={id} value={id} className="px-4">
                {t(($) => $.gate.tab[id])}
                <span className="ml-1 text-muted-foreground tabular-nums">{lists[id].length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <OnboardingGate reason={tc(($) => $.onboarding.gate.walk_in)} touch>
          {(blocked) => (
            <Button
              variant="outline"
              disabled={!online || blocked}
              onClick={() => setSearch({ walkin: 1 })}
            >
              <TruckIcon /> {t(($) => $.gate.action.walk_in)}
            </Button>
          )}
        </OnboardingGate>
      </div>

      {!online ? (
        <p
          role="alert"
          className="rounded-md border border-tone-danger-border bg-tone-danger-bg px-4 py-2 text-tone-danger"
        >
          {t(($) => $.gate.offline)}{' '}
          {asOf && expected.data ? (
            <span>
              {t(($) => $.gate.as_of)} <InstantTime at={asOf} timeZone={expected.data.timeZone} />
            </span>
          ) : null}
        </p>
      ) : null}

      <section aria-labelledby="gate-list">
        <h2 id="gate-list" className="sr-only">
          {q !== '' ? t(($) => $.gate.search.results, { q }) : t(($) => $.gate.list[tab])}
        </h2>
        {q !== '' && found.data?.items.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            {t(($) => $.gate.search.none, { q })}
          </p>
        ) : shown.length === 0 && q === '' ? (
          <p className="py-10 text-center text-muted-foreground">{t(($) => $.gate.empty[tab])}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((b) => (
              <TruckRow
                key={b.id}
                truck={b}
                online={online}
                canCall={canCall}
                onOpen={() => setSearch({ checkin: b.id })}
                onCheckOut={() => setCheckOut(b.id)}
                onCall={() => setCalling(b.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={dialogTruck !== undefined}
        onOpenChange={(open) => !open && setSearch({ checkin: undefined })}
      >
        {dialogTruck ? (
          <CheckInDialog
            key={dialogTruck.id}
            orgId={orgId}
            siteId={siteId}
            truck={dialogTruck}
            online={online}
            onDone={() => setSearch({ checkin: undefined })}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={search.walkin === 1}
        onOpenChange={(open) => !open && setSearch({ walkin: undefined })}
      >
        {search.walkin === 1 ? (
          <WalkInDialog
            orgId={orgId}
            siteId={siteId}
            online={online}
            onDone={() => setSearch({ walkin: undefined })}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={checkOut !== undefined}
        onOpenChange={(open) => !open && setCheckOut(undefined)}
      >
        {checkOut ? (
          <CheckOutDialog
            orgId={orgId}
            truck={checkOut}
            online={online}
            onDone={() => setCheckOut(undefined)}
          />
        ) : null}
      </Dialog>
      <Dialog open={calling !== undefined} onOpenChange={(open) => !open && setCalling(undefined)}>
        {calling ? (
          <CallDialog
            orgId={orgId}
            siteId={siteId}
            truck={calling}
            online={online}
            onDone={() => setCalling(undefined)}
          />
        ) : null}
      </Dialog>
    </>
  );
}

const isOnSite = (b: YardTruck | OnSiteTruck): b is OnSiteTruck => 'onSiteMinutes' in b;

function TruckRow({
  truck: b,
  online,
  canCall,
  onOpen,
  onCheckOut,
  onCall,
}: {
  truck: YardTruck | OnSiteTruck;
  online: boolean;
  canCall: boolean;
  onOpen: () => void;
  onCheckOut: () => void;
  onCall: () => void;
}) {
  const { t } = useTranslation('yard');
  const { orgId } = Route.useParams();
  const loadTypeName = useLoadTypeName();
  const blocked = b.safety.enforced && b.safety.status === SafetyStatus.missing;
  const onSite = isOnSite(b);
  return (
    <li
      data-testid="gate-row"
      className={cn(
        'grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-lg border bg-background px-4 py-3 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto]',
        b.status === BookingStatus.no_show && 'opacity-80',
      )}
    >
      <div>
        <SlotRange truck={b} className="whitespace-nowrap text-lg font-semibold" />
        <div className="mt-1">
          <TruckPunctuality truck={b} size={BadgeSize.sm} />
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-lg font-semibold">{b.carrierName}</div>
        <div className="truncate text-muted-foreground">
          {b.plate ? <span className="font-mono">{b.plate}</span> : t(($) => $.gate.row.no_plate)} ·{' '}
          {t(($) => $.gate.row.units, { count: b.loadUnits })} · {loadTypeName(b.loadType.name)} ·{' '}
          <a
            className="font-mono underline-offset-4 hover:underline"
            href={`/t/${orgId}/bookings/${b.id}`}
          >
            {b.code}
          </a>
          {b.walkIn ? ` · ${t(($) => $.gate.row.walk_in)}` : null}
        </div>
        {onSite ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {t(($) => $.gate.row.on_site, { minutes: b.onSiteMinutes })} (
              {b.checkedInAt ? <InstantTime at={b.checkedInAt} timeZone={b.timeZone} /> : null})
            </span>
            <span>{t(($) => $.gate.row.waiting, { minutes: b.waitMinutes })}</span>
            {b.dock ? (
              <span>{t(($) => $.gate.row.dock, { dock: b.dock.code, hall: b.dock.hall })}</span>
            ) : null}
            {b.standgeld ? (
              <StatusBadge
                meta={{ label: '', icon: TimerIcon, tone: BadgeTone.danger }}
                label={t(($) => $.gate.row.standgeld, { minutes: b.onSiteMinutes })}
                size={BadgeSize.sm}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="hidden flex-col items-end gap-1 lg:flex">
        <TruckSafety safety={b.safety} size={BadgeSize.lg} />
        <TruckStatus status={b.status} size={BadgeSize.lg} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {EXPECTED.has(b.status) ? (
          <Button
            className="min-w-36"
            variant={blocked ? 'outline' : 'default'}
            disabled={!online}
            onClick={onOpen}
          >
            <LogInIcon /> {t(($) => $.gate.action.check_in)}
          </Button>
        ) : null}
        {b.status === BookingStatus.checked_in && canCall ? (
          <Button variant="outline" disabled={!online} onClick={onCall}>
            <BellRingIcon /> {t(($) => $.docks.call.confirm_none)}
          </Button>
        ) : null}
        {b.status === BookingStatus.checked_in ? (
          <Button variant="outline" disabled={!online} onClick={onOpen}>
            <OctagonXIcon /> {t(($) => $.gate.action.turn_away)}
          </Button>
        ) : null}
        {onSite ? (
          <Button disabled={!online} onClick={onCheckOut}>
            <LogOutIcon /> {t(($) => $.gate.action.check_out)}
          </Button>
        ) : null}
      </div>
    </li>
  );
}
