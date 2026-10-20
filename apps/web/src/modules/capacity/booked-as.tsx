import type { DockBooking, ResourceView } from '@rampflow/shared/modules/booking/api.capacity';
import { DockBookingKind, ResourceKind } from '@rampflow/shared/modules/booking/values';
import type { DockView } from '@rampflow/shared/modules/core/api.sites';
import { Feature } from '@rampflow/shared/values';
import { useMutation } from '@tanstack/react-query';
import { LayersIcon, SquareIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAccess } from '@/lib/access';
import { api, call } from '@/lib/api';
import { useRefreshMasterData } from './queries';

// MD-03: how a dock is booked. A dock is in exactly one pool, or bookable on its own as a
// single dock, or not bookable. One select per dock row makes that choice; the API moves the
// dock in one transaction (PUT /capacity/docks/:dockId/booking).

type Choice = 'none' | 'single' | `pool:${string}`;

const choiceOf = (holder: ResourceView | undefined): Choice =>
  !holder ? 'none' : holder.kind === ResourceKind.single ? 'single' : `pool:${holder.id}`;

function bookingOf(choice: Choice): DockBooking {
  if (choice === DockBookingKind.none) return { as: DockBookingKind.none };
  if (choice === DockBookingKind.single) return { as: DockBookingKind.single };
  return { as: DockBookingKind.pool, resourceId: choice.slice('pool:'.length) };
}

/** The resource name of a dock's holder with its kind icon, for read-only views. */
export function BookedAsLabel({ holder }: { holder: ResourceView | undefined }) {
  const { t } = useTranslation('booking');
  if (!holder)
    return <span className="text-muted-foreground">{t(($) => $.capacity.booked_as.none)}</span>;
  const Icon = holder.kind === ResourceKind.pool ? LayersIcon : SquareIcon;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {holder.kind === ResourceKind.pool ? holder.name : t(($) => $.capacity.booked_as.single)}
    </span>
  );
}

export function BookedAsSelect({
  orgId,
  dock,
  holder,
  pools,
}: {
  orgId: string;
  dock: DockView;
  holder: ResourceView | undefined;
  /** The site's pools. */
  pools: ResourceView[];
}) {
  const { t } = useTranslation('booking');
  const { has } = useAccess();
  const refresh = useRefreshMasterData(orgId);
  const poolsOn = has(Feature.booking.pools);
  const move = useMutation({
    mutationFn: (choice: Choice) =>
      call(
        api.t[':orgId'].capacity.docks[':dockId'].booking.$put({
          param: { orgId, dockId: dock.id },
          json: bookingOf(choice),
        }),
      ),
    onSuccess: () => toast.success(t(($) => $.capacity.booked_as.saved, { code: dock.code })),
    onSettled: refresh,
  });
  const current = choiceOf(holder);
  const offered = pools.filter((p) => p.active || p.id === holder?.id);
  return (
    <NativeSelect
      size="sm"
      className="w-44"
      aria-label={t(($) => $.capacity.booked_as.label, { code: dock.code })}
      value={current}
      disabled={move.isPending || (!poolsOn && holder?.kind === ResourceKind.pool)}
      onChange={(e) => move.mutate(e.target.value as Choice)}
    >
      <NativeSelectOption value="none">{t(($) => $.capacity.booked_as.none)}</NativeSelectOption>
      <NativeSelectOption value="single">
        {t(($) => $.capacity.booked_as.single)}
      </NativeSelectOption>
      {offered.map((p) => (
        <NativeSelectOption
          key={p.id}
          value={`pool:${p.id}`}
          disabled={!poolsOn && p.id !== holder?.id}
        >
          {p.active
            ? t(($) => $.capacity.booked_as.pool, { name: p.name })
            : t(($) => $.capacity.booked_as.pool_inactive, { name: p.name })}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
