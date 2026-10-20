import type { BookingView, RescheduleBooking } from '@rampflow/shared/modules/booking/api.staff';
import { availableCommands, type BookingStatus } from '@rampflow/shared/modules/booking/lifecycle';
import {
  BookingParty,
  ChangeLock,
  OnSiteStatus,
  RescheduleProblem,
} from '@rampflow/shared/modules/booking/values';
import { type LocalDate, localDateSchema, siteDay, type TimeZone } from '@rampflow/shared/time';
import { ErrorCode, Feature, isValueOf, Permission } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useAccess } from '@/lib/access';
import { ApiFailure, api, call } from '@/lib/api';
import { availabilityQuery, boardQuery, bookingKey } from './queries';
import { StartPicker, startOptions } from './start-picker';

// BK-03: what staff may change on a booking, and the reschedule and cancel dialogs. The command
// table of the shared lifecycle decides; the API decides again.

/** Whether staff may reschedule and cancel `status`, and why not. */
export function useChangeAccess(status: BookingStatus) {
  const access = useAccess();
  const commands = availableCommands(status, BookingParty.staff, access.can);
  const lock: ChangeLock | null = !access.can(Permission.booking.staff_book)
    ? ChangeLock.no_permission
    : commands.includes('reschedule')
      ? null
      : isValueOf(OnSiteStatus, status)
        ? ChangeLock.on_site
        : ChangeLock.closed;
  return {
    lock,
    canReschedule: commands.includes('reschedule'),
    canCancel: commands.includes('cancel'),
    canEditAvis: commands.includes('update_avis') && access.has(Feature.avis.basic),
  };
}

/** The one-line reason under the disabled buttons. */
export function LockReason({ lock, status }: { lock: ChangeLock; status: BookingStatus }) {
  const { t } = useTranslation('booking');
  if (lock === ChangeLock.no_permission) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {lock === ChangeLock.on_site
        ? t(($) => $.plan.detail.locked_on_site)
        : t(($) => $.plan.detail.locked_closed, {
            status: t(($) => $.lifecycle.status[status]),
          })}
    </p>
  );
}

const FORCE_REASONS = new Set(['capacity_full', 'daily_cap_reached']);

export function RescheduleDialog({
  orgId,
  booking,
  open,
  onOpenChange,
}: {
  orgId: string;
  booking: BookingView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('booking');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(($) => $.plan.reschedule.title, { code: booking.code })}</DialogTitle>
          <DialogDescription>{t(($) => $.plan.reschedule.description)}</DialogDescription>
        </DialogHeader>
        {open ? (
          <RescheduleForm orgId={orgId} booking={booking} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RescheduleForm({
  orgId,
  booking,
  onDone,
}: {
  orgId: string;
  booking: BookingView;
  onDone: () => void;
}) {
  const { t } = useTranslation('booking');
  const id = useId();
  const access = useAccess();
  const canForce = access.can(Permission.booking.force);
  const queryClient = useQueryClient();
  const bookedDay = siteDay(new Date(booking.startsAt), booking.timeZone as TimeZone);
  const [day, setDay] = useState<string>(bookedDay);
  const [resourceId, setResourceId] = useState(booking.resource.id);
  const [startsAt, setStartsAt] = useState('');
  const [forceReason, setForceReason] = useState('');
  const [forceNeeded, setForceNeeded] = useState(false);
  const [error, setError] = useState<RescheduleProblem | null>(null);
  const date: LocalDate = localDateSchema.safeParse(day).data ?? bookedDay;
  const board = useQuery({ ...boardQuery(orgId, booking.siteId, date), refetchInterval: false });
  const offers = useQuery(
    availabilityQuery(orgId, {
      siteId: booking.siteId,
      date,
      loadTypeId: booking.loadType.id,
      loadUnits: booking.loadUnits,
      resourceId,
    }),
  );
  // The booking's own slot is offered to itself: the API re-checks without counting it.
  const options = board.data
    ? startOptions(board.data, offers.data, [resourceId]).map((o) =>
        o.startsAt === booking.startsAt ? { ...o, offered: true } : o,
      )
    : [];
  const chosen = options.find((o) => o.startsAt === startsAt);
  const forcing = forceNeeded || (chosen !== undefined && !chosen.offered);

  const reschedule = useMutation({
    mutationFn: (body: RescheduleBooking) =>
      call<BookingView>(
        api.t[':orgId'].bookings[':bookingId'].$patch({
          param: { orgId, bookingId: booking.id },
          json: body,
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bookingKey(orgId) });
      toast.success(t(($) => $.plan.reschedule.done));
      onDone();
    },
    onError: (e) => {
      if (
        e instanceof ApiFailure &&
        e.code === ErrorCode.conflict &&
        FORCE_REASONS.has(e.conflictReason ?? '')
      ) {
        setForceNeeded(canForce);
      }
      void queryClient.invalidateQueries({ queryKey: bookingKey(orgId) });
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!chosen) return setError('time');
    if (forcing && forceReason.trim() === '') return setError('reason');
    setError(null);
    reschedule.mutate({
      startsAt,
      resourceId,
      version: booking.version,
      ...(forcing ? { force: true, forceReason: forceReason.trim() } : {}),
    });
  };

  const resources = board.data?.resources ?? [];
  return (
    <form noValidate onSubmit={submit}>
      <FieldGroup className="py-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${id}-date`}>{t(($) => $.plan.sheet.date)}</FieldLabel>
            <Input
              id={`${id}-date`}
              type="date"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                setStartsAt('');
                setForceNeeded(false);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-resource`}>{t(($) => $.plan.sheet.resource)}</FieldLabel>
            <NativeSelect
              id={`${id}-resource`}
              className="w-full"
              value={resourceId}
              onChange={(e) => {
                setResourceId(e.target.value);
                setStartsAt('');
                setForceNeeded(false);
              }}
            >
              {resources.map((r) => (
                <NativeSelectOption key={r.id} value={r.id}>
                  {r.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Field data-invalid={error === RescheduleProblem.time}>
          <FieldTitle id={`${id}-time`}>{t(($) => $.plan.sheet.start_time)}</FieldTitle>
          {board.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <StartPicker
              options={options}
              value={startsAt}
              onChange={(v) => {
                setStartsAt(v);
                setForceNeeded(false);
              }}
              canForce={canForce}
              timeZone={booking.timeZone}
              labelledBy={`${id}-time`}
              invalid={error === RescheduleProblem.time}
            />
          )}
          <FieldError>
            {error === RescheduleProblem.time ? t(($) => $.plan.sheet.choose_time) : null}
          </FieldError>
        </Field>
        {forcing ? (
          <Alert className="border-tone-onsite-border bg-tone-onsite-bg">
            <AlertTitle>{t(($) => $.plan.sheet.force_title)}</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 text-foreground">
              <span>
                {canForce
                  ? t(($) => $.plan.sheet.force_description)
                  : t(($) => $.plan.sheet.force_denied)}
              </span>
              {canForce ? (
                <Field data-invalid={error === RescheduleProblem.reason}>
                  <FieldLabel htmlFor={`${id}-force-reason`}>
                    {t(($) => $.plan.sheet.force_reason)}
                  </FieldLabel>
                  <Textarea
                    id={`${id}-force-reason`}
                    rows={2}
                    className="bg-background"
                    value={forceReason}
                    aria-invalid={error === RescheduleProblem.reason}
                    onChange={(e) => setForceReason(e.target.value)}
                  />
                  <FieldError>
                    {error === RescheduleProblem.reason
                      ? t(($) => $.plan.sheet.force_reason_required)
                      : null}
                  </FieldError>
                </Field>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <FieldDescription>{t(($) => $.plan.reschedule.email_hint)}</FieldDescription>
      </FieldGroup>
      <DialogFooter className="pt-4">
        <Button type="button" variant="outline" onClick={onDone}>
          {t(($) => $.plan.actions.close)}
        </Button>
        <Button type="submit" disabled={reschedule.isPending || (forcing && !canForce)}>
          {reschedule.isPending ? <Spinner /> : null}
          {forcing ? t(($) => $.plan.reschedule.submit_force) : t(($) => $.plan.reschedule.submit)}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CancelDialog({
  orgId,
  booking,
  open,
  onOpenChange,
}: {
  orgId: string;
  booking: BookingView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('booking');
  const id = useId();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () =>
      call<BookingView>(
        api.t[':orgId'].bookings[':bookingId'].cancel.$post({
          param: { orgId, bookingId: booking.id },
          json: reason.trim() ? { reason: reason.trim() } : {},
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bookingKey(orgId) });
      toast.success(t(($) => $.plan.cancel.done, { code: booking.code }));
      onOpenChange(false);
    },
  });
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(($) => $.plan.cancel.title, { code: booking.code })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t(($) => $.plan.cancel.description)}</AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor={`${id}-reason`}>{t(($) => $.plan.cancel.reason)}</FieldLabel>
          <Textarea
            id={`${id}-reason`}
            rows={2}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>{t(($) => $.plan.cancel.keep)}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={cancel.isPending}
            onClick={(e) => {
              e.preventDefault();
              cancel.mutate();
            }}
          >
            {cancel.isPending ? <Spinner /> : null}
            {t(($) => $.plan.cancel.confirm)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
