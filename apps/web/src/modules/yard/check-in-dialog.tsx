import { TURN_AWAY_REASONS, type TurnAwayReason } from '@rampflow/shared/modules/booking/lifecycle';
import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import { SafetyStatus } from '@rampflow/shared/modules/safety/values';
import type { AcknowledgementCandidate, YardTruck } from '@rampflow/shared/modules/yard/api';
import { Setting } from '@rampflow/shared/values';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LinkIcon,
  LogInIcon,
  OctagonXIcon,
  PlayIcon,
  RefreshCwIcon,
  UserSearchIcon,
} from 'lucide-react';
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
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAccess } from '@/lib/access';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useYardMutation, yardApi, yardKey } from './queries';
import {
  InstantTime,
  SlotRange,
  TruckPunctuality,
  TruckSafety,
  useLoadTypeName,
} from './truck-parts';

// YD-02: check in with the plate as seen, see punctuality and the safety status, link a briefing
// by driver name or start it on this device, or turn the truck away with a listed reason.

const CHECKABLE = new Set<YardTruck['status']>([BookingStatus.confirmed, BookingStatus.no_show]);
const TURNABLE = new Set<YardTruck['status']>([
  BookingStatus.confirmed,
  BookingStatus.no_show,
  BookingStatus.checked_in,
]);

export function CheckInDialog({
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
  const { t: tb } = useTranslation('booking');
  const access = useAccess();
  const loadTypeName = useLoadTypeName();
  const commands = yardApi(orgId);
  const [plate, setPlate] = useState(truck.plate ?? '');
  const [reason, setReason] = useState<TurnAwayReason | ''>('');
  const canCheckIn = CHECKABLE.has(truck.status);
  const blocked = truck.safety.enforced && truck.safety.status === SafetyStatus.missing;

  const checkIn = useYardMutation(orgId, () => commands.checkIn(truck.id, plate.trim() || null), {
    onSuccess: () => {
      toast.success(t(($) => $.gate.check_in.done, { carrier: truck.carrierName }));
      onDone();
    },
  });
  const turnAway = useYardMutation(orgId, (r: TurnAwayReason) => commands.turnAway(truck.id, r), {
    onSuccess: () => {
      toast.success(t(($) => $.gate.check_in.turned_away, { carrier: truck.carrierName }));
      onDone();
    },
  });

  return (
    <DialogContent
      className="max-h-[95svh] overflow-y-auto sm:max-w-2xl"
      data-density="touch"
      showCloseButton={false}
    >
      <DialogHeader>
        <DialogTitle className="text-xl">
          {t(($) => $.gate.check_in.title, { carrier: truck.carrierName })}
        </DialogTitle>
        <DialogDescription>
          {t(($) => $.gate.check_in.slot)} <SlotRange truck={truck} /> ·{' '}
          {t(($) => $.gate.row.units, { count: truck.loadUnits })} ·{' '}
          {loadTypeName(truck.loadType.name)} · <span className="font-mono">{truck.code}</span>
        </DialogDescription>
      </DialogHeader>

      {canCheckIn ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="plate-seen">{t(($) => $.gate.check_in.plate_seen)}</FieldLabel>
            <Input
              id="plate-seen"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              className="h-12 font-mono text-lg uppercase"
              autoComplete="off"
            />
          </Field>
          <div>
            <div className="text-sm font-medium">{t(($) => $.gate.check_in.arrival)}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <InstantTime
                at={new Date()}
                timeZone={truck.timeZone}
                className="text-lg font-semibold"
              />
              <TruckPunctuality truck={truck} size="lg" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {truck.walkIn
                ? t(($) => $.gate.check_in.walk_in_no_slot)
                : t(($) => $.gate.check_in.tolerance, {
                    early: access.setting(Setting.yard.early_tolerance_minutes, siteId),
                    grace: access.setting(Setting.yard.grace_minutes, siteId),
                  })}
            </p>
          </div>
        </div>
      ) : null}

      {canCheckIn && truck.safety.status !== SafetyStatus.not_required ? (
        <SafetySection orgId={orgId} truck={truck} online={online} blocked={blocked} />
      ) : null}

      {TURNABLE.has(truck.status) ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <Field className="min-w-64 flex-1">
            <FieldLabel htmlFor="turn-reason">
              {t(($) => $.gate.check_in.turn_away_title)}
            </FieldLabel>
            <NativeSelect
              id="turn-reason"
              className="h-12"
              value={reason}
              onChange={(e) => setReason(e.target.value as TurnAwayReason | '')}
            >
              <NativeSelectOption value="">
                {t(($) => $.gate.check_in.choose_reason)}
              </NativeSelectOption>
              {TURN_AWAY_REASONS.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {tb(($) => $.lifecycle.turnAwayReason[r])}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Button
            variant="destructive"
            size="lg"
            className="h-12"
            disabled={reason === '' || !online || turnAway.isPending}
            onClick={() => reason !== '' && turnAway.mutate(reason)}
          >
            <OctagonXIcon /> {t(($) => $.gate.action.turn_away)}
          </Button>
        </div>
      ) : null}

      <DialogFooter className="items-center">
        {!online ? (
          <span className="mr-auto text-sm text-tone-danger">{t(($) => $.gate.offline)}</span>
        ) : canCheckIn && blocked ? (
          <span className="mr-auto text-sm text-tone-danger">
            {t(($) => $.gate.check_in.blocked)}
          </span>
        ) : null}
        <Button variant="ghost" size="lg" onClick={onDone}>
          {t(($) => $.gate.check_in.cancel)}
        </Button>
        {canCheckIn ? (
          <Button
            size="lg"
            className="h-12 min-w-44"
            disabled={blocked || !online || checkIn.isPending}
            onClick={() => checkIn.mutate(undefined)}
          >
            <LogInIcon /> {t(($) => $.gate.check_in.check_in_now)}
          </Button>
        ) : null}
      </DialogFooter>
    </DialogContent>
  );
}

function SafetySection({
  orgId,
  truck,
  online,
  blocked,
}: {
  orgId: string;
  truck: YardTruck;
  online: boolean;
  blocked: boolean;
}) {
  const { t } = useTranslation('yard');
  const commands = yardApi(orgId);
  const valid = truck.safety.status === SafetyStatus.valid;
  const [name, setName] = useState('');
  const [opened, setOpened] = useState(false);
  const find = useMutation({
    mutationFn: (q: string) => commands.candidates(truck.id, q),
  });
  const link = useYardMutation(orgId, (ackId: string) => commands.link(truck.id, ackId));
  const session = useMutation({
    mutationFn: () => commands.briefingSession(truck.id),
    onSuccess: ({ url }) => {
      window.open(url, '_blank', 'noopener');
      setOpened(true);
    },
  });
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: yardKey(orgId) });

  return (
    <section
      className={cn(
        'rounded-lg border p-4',
        valid
          ? 'border-tone-success-border bg-tone-success-bg/50'
          : blocked
            ? 'border-tone-danger-border bg-tone-danger-bg/50'
            : 'border-tone-onsite-border bg-tone-onsite-bg/50',
      )}
      aria-labelledby="safety-heading"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="safety-heading" className="font-semibold">
          {t(($) => $.gate.check_in.safety_title)}
        </h3>
        <TruckSafety safety={truck.safety} size="lg" />
      </div>
      <p className="mt-1 text-sm">
        {valid
          ? t(($) => $.gate.check_in.safety_valid)
          : blocked
            ? t(($) => $.gate.check_in.safety_blocked)
            : t(($) => $.gate.check_in.safety_warn)}
      </p>
      {valid ? null : (
        <div className="mt-3 flex flex-col gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length >= 2) find.mutate(name.trim());
            }}
          >
            <Field>
              <FieldLabel htmlFor="driver-name">{t(($) => $.gate.check_in.driver_name)}</FieldLabel>
              <InputGroup className="h-12">
                <InputGroupAddon>
                  <UserSearchIcon className="size-5" />
                </InputGroupAddon>
                <InputGroupInput
                  id="driver-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    className="h-11 min-w-11"
                    type="submit"
                    disabled={!online || name.trim().length < 2}
                  >
                    {t(($) => $.gate.check_in.find)}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </form>
          {find.data ? (
            find.data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t(($) => $.gate.check_in.no_candidates)}
              </p>
            ) : (
              <ul
                className="flex flex-col gap-2"
                aria-label={t(($) => $.gate.check_in.driver_name)}
              >
                {find.data.items.map((c) => (
                  <Candidate
                    key={c.id}
                    candidate={c}
                    timeZone={truck.timeZone}
                    disabled={!online || link.isPending}
                    onLink={() => link.mutate(c.id)}
                  />
                ))}
              </ul>
            )
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="lg"
              className="h-12"
              disabled={!online || session.isPending}
              onClick={() => session.mutate()}
            >
              <PlayIcon /> {t(($) => $.gate.check_in.start_briefing)}
            </Button>
            {opened ? (
              <Button variant="ghost" size="lg" className="h-12" onClick={() => void refresh()}>
                <RefreshCwIcon /> {t(($) => $.gate.check_in.refresh)}
              </Button>
            ) : null}
          </div>
          {opened ? <p className="text-sm">{t(($) => $.gate.check_in.briefing_opened)}</p> : null}
        </div>
      )}
    </section>
  );
}

function Candidate({
  candidate,
  timeZone,
  disabled,
  onLink,
}: {
  candidate: AcknowledgementCandidate;
  timeZone: string;
  disabled: boolean;
  onLink: () => void;
}) {
  const { t } = useTranslation('yard');
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(
    new Date(candidate.completedAt),
  );
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
      <div className="min-w-0">
        <div className="truncate font-medium">{candidate.driverName}</div>
        <div className="truncate text-sm text-muted-foreground">
          {t(($) => $.gate.check_in.candidate, { instruction: candidate.instruction.name, date })}
        </div>
      </div>
      <Button variant="outline" size="lg" disabled={disabled} onClick={onLink}>
        <LinkIcon /> {t(($) => $.gate.check_in.link)}
      </Button>
    </li>
  );
}
