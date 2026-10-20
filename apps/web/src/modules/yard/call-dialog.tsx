import { ResourceKind } from '@rampflow/shared/modules/booking/values';
import { DockStatus } from '@rampflow/shared/modules/core/values';
import type { YardDock, YardTruck } from '@rampflow/shared/modules/yard/api';
import { useQuery } from '@tanstack/react-query';
import { BellRingIcon, PhoneIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { docksQuery, useYardMutation, yardApi } from './queries';

// YD-07: pick a dock and call the truck. Free docks of the booking's resource are suggested
// (a single-dock booking preselects its dock); other active docks work with a warning.

const blocked = (d: YardDock, truck: YardTruck) =>
  d.status !== DockStatus.active || (d.occupant !== null && d.occupant.id !== truck.id);

export function CallDialog({
  orgId,
  siteId,
  truck,
  online,
  onDone,
}: {
  orgId: string;
  siteId: string;
  truck: YardTruck;
  online: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation('yard');
  const docks = useQuery(docksQuery(orgId, siteId)).data?.halls.flatMap((h) => h.docks) ?? [];
  const member = (d: YardDock) => d.resourceId === truck.resource.id;
  const suggested = docks.find((d) => member(d) && !blocked(d, truck));
  const [picked, setPicked] = useState<string | undefined>();
  const chosen = docks.find((d) => d.id === (picked ?? suggested?.id));
  const callTruck = useYardMutation(
    orgId,
    (dockId: string) => yardApi(orgId).call(truck.id, dockId),
    {
      onSuccess: (result) => {
        toast.success(
          t(($) => $.docks.call.done, {
            carrier: truck.carrierName,
            dock: result.truck.dock?.code ?? '',
          }),
        );
        onDone();
      },
    },
  );

  return (
    <DialogContent className="sm:max-w-2xl" data-density="touch" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle className="text-xl">
          {t(($) => $.docks.call.title, { carrier: truck.carrierName })}
        </DialogTitle>
        <DialogDescription>
          {truck.resource.kind === ResourceKind.pool
            ? t(($) => $.docks.call.pool, { resource: truck.resource.name })
            : t(($) => $.docks.call.single, { resource: truck.resource.name })}{' '}
          {truck.plate ? <span className="font-mono">{truck.plate}</span> : null}
        </DialogDescription>
      </DialogHeader>
      <fieldset className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        <legend className="sr-only">{t(($) => $.docks.call.docks)}</legend>
        {docks.map((d) => {
          const active = d.id === chosen?.id;
          const disabled = blocked(d, truck);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => setPicked(d.id)}
              className={cn(
                'flex h-20 flex-col items-center justify-center rounded-lg border text-lg font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                active && 'border-primary bg-primary text-primary-foreground',
                !active &&
                  member(d) &&
                  !disabled &&
                  'border-tone-success-border bg-tone-success-bg',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {d.code}
              <span
                className={cn(
                  'text-xs font-normal',
                  active ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
              >
                {d.occupant && d.occupant.id !== truck.id
                  ? d.occupant.carrierName
                  : d.status === DockStatus.maintenance
                    ? t(($) => $.docks.dock.maintenance)
                    : member(d)
                      ? t(($) => $.docks.call.suggested)
                      : t(($) => $.docks.call.other)}
              </span>
            </button>
          );
        })}
      </fieldset>
      {chosen && !member(chosen) ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-tone-onsite-border bg-tone-onsite-bg px-3 py-2 text-sm text-tone-onsite"
        >
          <TriangleAlertIcon className="size-4 shrink-0" />
          {t(($) => $.docks.call.outside, { dock: chosen.code, resource: truck.resource.name })}
        </div>
      ) : null}
      <DialogFooter className="items-center">
        {truck.driverPhone ? (
          <Button
            variant="outline"
            size="lg"
            className="mr-auto h-12"
            nativeButton={false}
            render={<a href={`tel:${truck.driverPhone}`} />}
          >
            <PhoneIcon /> {truck.driverPhone}
          </Button>
        ) : null}
        <Button variant="ghost" size="lg" onClick={onDone}>
          {t(($) => $.docks.call.cancel)}
        </Button>
        <Button
          size="lg"
          className="h-12 min-w-44"
          disabled={!chosen || !online || callTruck.isPending}
          onClick={() => chosen && callTruck.mutate(chosen.id)}
        >
          <BellRingIcon />
          {chosen
            ? t(($) => $.docks.call.confirm, { dock: chosen.code })
            : t(($) => $.docks.call.confirm_none)}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
