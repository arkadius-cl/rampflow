import type { OnSiteTruck, YardDock, YardTruck } from '@rampflow/shared/modules/yard/api';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeftRightIcon,
  BellRingIcon,
  CircleCheckIcon,
  DoorOpenIcon,
  PackageOpenIcon,
  PhoneIcon,
  UndoIcon,
  WrenchIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useOnline } from '@/components/app-shell/station-shell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { guard, useAccess } from '@/lib/access';
import { cn } from '@/lib/utils';
import { CallDialog } from '@/modules/yard/call-dialog';
import { docksQuery, useYardMutation, yardApi } from '@/modules/yard/queries';
import { stationSearch, useStationSite } from '@/modules/yard/station';
import { InstantTime, SlotRange, TruckStatus } from '@/modules/yard/truck-parts';

// Dock station (YD-06 to YD-08): docks by hall with their truck and one progress button, the
// queue of checked-in trucks by slot start, the call dialog, and "Cancel call".

interface DocksSearch {
  site?: string;
  call?: string;
}

export const Route = createFileRoute('/t/$orgId/docks/')({
  staticData: { shell: 'station' },
  beforeLoad: guard({ permission: 'yard.call', entitlement: 'yard.call_to_dock' }),
  validateSearch: (search: Record<string, unknown>): DocksSearch => ({
    ...stationSearch(search),
    call: typeof search.call === 'string' ? search.call : undefined,
  }),
  component: DocksScreen,
});

function DocksScreen() {
  const site = useStationSite();
  if (!site) return null;
  return <Docks siteId={site.id} />;
}

function Docks({ siteId }: { siteId: string }) {
  const { t } = useTranslation('yard');
  const { orgId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const online = useOnline();
  const view = useQuery(docksQuery(orgId, siteId)).data;
  const [completingId, setCompleting] = useState<string>();
  const queue = view?.queue ?? [];
  const occupants =
    view?.halls.flatMap((h) => h.docks.flatMap((d) => (d.occupant ? [d.occupant] : []))) ?? [];
  const calling = [...queue, ...occupants].find((b) => b.id === search.call);
  const completing = occupants.find((b) => b.id === completingId);
  const setCall = (call: string | undefined) =>
    void navigate({ search: (prev) => ({ ...prev, call }) });

  return (
    <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-5">
        {!online ? (
          <p
            role="alert"
            className="rounded-md border border-tone-danger-border bg-tone-danger-bg px-4 py-2 text-tone-danger"
          >
            {t(($) => $.gate.offline)}
          </p>
        ) : null}
        {view && view.halls.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{t(($) => $.docks.empty)}</p>
        ) : null}
        {view?.halls.map((hall) => (
          <section key={hall.id} aria-labelledby={`hall-${hall.id}`}>
            <h2
              id={`hall-${hall.id}`}
              className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {hall.name}
            </h2>
            <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {hall.docks.map((d) => (
                <DockCard
                  key={d.id}
                  dock={d}
                  online={online}
                  onComplete={(truck) => setCompleting(truck.id)}
                  onReassign={(truck) => setCall(truck.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside
        className="flex min-h-0 flex-col rounded-lg border bg-background"
        aria-labelledby="queue-heading"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 id="queue-heading" className="font-semibold">
            {t(($) => $.docks.queue.title)}
          </h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-sm font-medium tabular-nums">
            {queue.length}
          </span>
        </div>
        <ul className="flex flex-col divide-y overflow-y-auto">
          {queue.map((b) => (
            <QueueItem key={b.id} truck={b} online={online} onCall={() => setCall(b.id)} />
          ))}
          {queue.length === 0 ? (
            <li className="px-4 py-10 text-center text-muted-foreground">
              {t(($) => $.docks.queue.empty)}
            </li>
          ) : null}
        </ul>
      </aside>

      <Dialog open={calling !== undefined} onOpenChange={(open) => !open && setCall(undefined)}>
        {calling ? (
          <CallDialog
            key={calling.id}
            orgId={orgId}
            siteId={siteId}
            truck={calling}
            online={online}
            onDone={() => setCall(undefined)}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={completing !== undefined}
        onOpenChange={(open) => !open && setCompleting(undefined)}
      >
        {completing ? (
          <CompleteDialog
            truck={completing}
            online={online}
            onDone={() => setCompleting(undefined)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function QueueItem({
  truck: b,
  online,
  onCall,
}: {
  truck: OnSiteTruck;
  online: boolean;
  onCall: () => void;
}) {
  const { t } = useTranslation('yard');
  return (
    <li className="flex flex-col gap-2 px-4 py-3" data-testid="queue-item">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{b.carrierName}</div>
          <div className="text-sm text-muted-foreground">
            {t(($) => $.docks.queue.slot)} <SlotRange truck={b} /> · {b.resource.name}
          </div>
          <div className="text-sm text-muted-foreground">
            {b.plate ? <span className="font-mono">{b.plate}</span> : t(($) => $.gate.row.no_plate)}{' '}
            · {t(($) => $.gate.row.units, { count: b.loadUnits })}
          </div>
        </div>
        <div
          className={cn('shrink-0 text-right text-sm', b.waitMinutes > 30 && 'text-tone-onsite')}
        >
          <div className="text-lg font-semibold tabular-nums">
            {t(($) => $.docks.queue.waiting, { minutes: b.waitMinutes })}
          </div>
          {t(($) => $.docks.queue.waiting_label)}
        </div>
      </div>
      <Button size="lg" className="h-12 w-full" disabled={!online} onClick={onCall}>
        <BellRingIcon /> {t(($) => $.docks.call.confirm_none)}
      </Button>
    </li>
  );
}

function DockCard({
  dock,
  online,
  onComplete,
  onReassign,
}: {
  dock: YardDock;
  online: boolean;
  onComplete: (truck: YardTruck) => void;
  onReassign: (truck: YardTruck) => void;
}) {
  const { t } = useTranslation('yard');
  const { orgId } = Route.useParams();
  const access = useAccess();
  const truck = dock.occupant;
  const maintenance = dock.status === 'maintenance';
  const commands = yardApi(orgId);
  const progress = useYardMutation(orgId, (step: 'dock' | 'loading' | 'uncall') => {
    if (!truck) throw new Error('no truck at the dock');
    if (step === 'dock') return commands.dock(truck.id);
    if (step === 'loading') return commands.startLoading(truck.id);
    return commands.uncall(truck.id);
  });
  const works = access.can('yard.dock');
  const disabled = !online || progress.isPending;

  return (
    <li
      data-testid={`dock-${dock.code}`}
      aria-label={dock.code}
      className={cn(
        'flex min-h-40 flex-col rounded-lg border bg-background p-3',
        truck && 'border-tone-active-border',
        maintenance && 'border-dashed bg-muted/40',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold tabular-nums">{dock.code}</span>
        <span className="text-xs text-muted-foreground">
          {t(($) => $.docks.dock.zone[dock.temperatureZone])}
          {dock.adrAllowed ? ` · ${t(($) => $.docks.dock.adr)}` : null}
        </span>
      </div>
      {maintenance ? (
        <div className="mt-auto flex items-center gap-2 text-muted-foreground">
          <WrenchIcon className="size-4" /> {t(($) => $.docks.dock.maintenance)}
        </div>
      ) : truck ? (
        <>
          <div className="mt-1 truncate font-semibold">{truck.carrierName}</div>
          <div className="text-sm text-muted-foreground">
            {truck.plate ? (
              <span className="font-mono">{truck.plate}</span>
            ) : (
              t(($) => $.gate.row.no_plate)
            )}{' '}
            · {t(($) => $.gate.row.units, { count: truck.loadUnits })}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <TruckStatus status={truck.status} size="md" />
            <span className="text-xs text-muted-foreground">
              {t(($) => $.docks.dock.since)}{' '}
              <InstantTime at={truck.since} timeZone={truck.timeZone} />
            </span>
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            {works && truck.status === 'called' ? (
              <Button
                size="lg"
                className="h-11 flex-1"
                disabled={disabled}
                onClick={() => progress.mutate('dock')}
              >
                <DoorOpenIcon /> {t(($) => $.docks.progress.at_dock)}
              </Button>
            ) : null}
            {works && truck.status === 'at_dock' ? (
              <Button
                size="lg"
                className="h-11 flex-1"
                disabled={disabled}
                onClick={() => progress.mutate('loading')}
              >
                <PackageOpenIcon /> {t(($) => $.docks.progress.loading)}
              </Button>
            ) : null}
            {works && truck.status !== 'called' ? (
              <Button
                size="lg"
                className="h-11 flex-1"
                disabled={disabled}
                onClick={() => onComplete(truck)}
              >
                <CircleCheckIcon /> {t(($) => $.docks.progress.done)}
              </Button>
            ) : null}
            {truck.status === 'called' ? (
              <Button
                size="lg"
                variant="outline"
                className="h-11"
                disabled={disabled}
                onClick={() => progress.mutate('uncall')}
              >
                <UndoIcon /> {t(($) => $.docks.progress.uncall)}
              </Button>
            ) : null}
            {truck.status === 'called' && access.can('yard.call') ? (
              <Button
                size="lg"
                variant="outline"
                className="h-11"
                disabled={disabled}
                onClick={() => onReassign(truck)}
              >
                <ArrowLeftRightIcon /> {t(($) => $.docks.progress.reassign)}
              </Button>
            ) : null}
            {truck.driverPhone ? (
              <Button
                variant="outline"
                size="lg"
                className="h-11 min-w-11 px-3"
                aria-label={t(($) => $.docks.dock.call_driver, { phone: truck.driverPhone })}
                nativeButton={false}
                render={<a href={`tel:${truck.driverPhone}`} />}
              >
                <PhoneIcon />
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-auto text-lg font-medium text-tone-success">
          {t(($) => $.docks.dock.free)}
        </div>
      )}
    </li>
  );
}

function CompleteDialog({
  truck,
  online,
  onDone,
}: {
  truck: YardTruck;
  online: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation('yard');
  const { orgId } = Route.useParams();
  const [units, setUnits] = useState(String(truck.loadUnits));
  const [note, setNote] = useState('');
  const count = Number(units);
  const valid = units !== '' && Number.isInteger(count) && count >= 0;
  const complete = useYardMutation(
    orgId,
    () => yardApi(orgId).complete(truck.id, count, note.trim() || undefined),
    {
      onSuccess: () => {
        toast.success(t(($) => $.docks.progress.done));
        onDone();
      },
    },
  );
  return (
    <DialogContent className="sm:max-w-lg" data-density="touch" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle className="text-xl">
          {t(($) => $.docks.complete.title, { carrier: truck.carrierName })}
        </DialogTitle>
        <DialogDescription>
          <SlotRange truck={truck} /> · <span className="font-mono">{truck.code}</span>
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={!valid}>
        <FieldLabel htmlFor="actual-units">{t(($) => $.docks.complete.actual_units)}</FieldLabel>
        <Input
          id="actual-units"
          type="number"
          min={0}
          inputMode="numeric"
          className="h-12 text-lg"
          value={units}
          aria-invalid={!valid}
          onChange={(e) => setUnits(e.target.value)}
        />
        <FieldDescription>
          {t(($) => $.docks.complete.announced, { count: truck.loadUnits })}
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="discrepancy">{t(($) => $.docks.complete.note)}</FieldLabel>
        <Textarea
          id="discrepancy"
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button variant="ghost" size="lg" onClick={onDone}>
          {t(($) => $.docks.call.cancel)}
        </Button>
        <Button
          size="lg"
          className="h-12 min-w-40"
          disabled={!valid || !online || complete.isPending}
          onClick={() => complete.mutate(undefined)}
        >
          <CircleCheckIcon /> {t(($) => $.docks.complete.confirm)}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
