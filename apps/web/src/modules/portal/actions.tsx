import type { PortalBookingView, PortalOffers } from '@rampflow/shared/modules/booking/api.portal';
import { type LocalDate, siteDay, type TimeZone } from '@rampflow/shared/time';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { errorText } from '@/components/app-shell/form-errors';
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
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { ApiFailure, api, call } from '@/lib/api';
import { offersKey, portalKey } from './queries';
import { PortalSlotPicker } from './slot-picker';
import { useDayStrip } from './use-offers';

// BK-05: the carrier reschedules (capacity re-checked) or cancels before the cutoff. The API
// decides again; a lost race refreshes the offers and keeps the dialog open.

const bookingApi = () => api.c[':orgId'].at[':tenantId'].bookings[':bookingId'];

/** A 409 that carries refreshed offers puts them in the cache of their day. */
export function useRefreshOffers(orgId: string) {
  const queryClient = useQueryClient();
  return (error: unknown, request: { tenantId: string; loadTypeId: string; loadUnits: number }) => {
    if (!(error instanceof ApiFailure) || error.code !== 'conflict') return false;
    const offers = error.details.offers as PortalOffers | undefined;
    if (!offers) return false;
    queryClient.setQueryData(
      offersKey(orgId, { ...request, siteId: offers.siteId, date: offers.date }),
      offers,
    );
    return true;
  };
}

export function RescheduleDialog({
  orgId,
  booking,
  open,
  onOpenChange,
}: {
  orgId: string;
  booking: PortalBookingView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('booking');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(($) => $.portal.reschedule.title, { code: booking.code })}</DialogTitle>
          <DialogDescription>{t(($) => $.portal.reschedule.description)}</DialogDescription>
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
  booking: PortalBookingView;
  onDone: () => void;
}) {
  const { t } = useTranslation('booking');
  const { t: tCore } = useTranslation('core');
  const queryClient = useQueryClient();
  const refreshOffers = useRefreshOffers(orgId);
  const bookedDay = siteDay(new Date(booking.startsAt), booking.timeZone as TimeZone);
  const [date, setDate] = useState<LocalDate | null>(bookedDay);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const request = {
    tenantId: booking.tenant.id,
    siteId: booking.site.id,
    loadTypeId: booking.loadType.id,
    loadUnits: booking.loadUnits,
  };
  const strip = useDayStrip(
    orgId,
    request,
    { timeZone: booking.timeZone, horizonDays: 365 },
    bookedDay,
  );
  const offers = strip.offersOn(date);
  const reschedule = useMutation({
    mutationFn: (to: string) =>
      call<PortalBookingView>(
        bookingApi().$patch({
          param: { orgId, tenantId: booking.tenant.id, bookingId: booking.id },
          json: { startsAt: to, version: booking.version },
        }),
      ),
    meta: { silent: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: portalKey(orgId) });
      toast.success(t(($) => $.portal.reschedule.done));
      onDone();
    },
    onError: (e) => {
      setStartsAt(null);
      if (refreshOffers(e, request)) toast.error(t(($) => $.portal.wizard.taken));
      else if (e instanceof ApiFailure) toast.error(errorText(tCore, e));
    },
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (startsAt) reschedule.mutate(startsAt);
      }}
    >
      <PortalSlotPicker
        days={strip.days}
        date={date}
        onDate={(d) => {
          setDate(d);
          setStartsAt(null);
        }}
        starts={offers?.starts}
        value={startsAt}
        onChange={setStartsAt}
        timeZone={booking.timeZone}
        durationMinutes={offers?.durationMinutes}
        onPrevious={strip.previous}
        onNext={strip.next}
      />
      <DialogFooter className="pt-4">
        <Button type="button" variant="outline" onClick={onDone}>
          {t(($) => $.portal.actions.close)}
        </Button>
        <Button type="submit" disabled={!startsAt || reschedule.isPending}>
          {reschedule.isPending ? <Spinner /> : null}
          {t(($) => $.portal.reschedule.submit)}
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
  booking: PortalBookingView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('booking');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () =>
      call<PortalBookingView>(
        bookingApi().cancel.$post({
          param: { orgId, tenantId: booking.tenant.id, bookingId: booking.id },
          json: reason.trim() ? { reason: reason.trim() } : {},
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: portalKey(orgId) });
      toast.success(t(($) => $.portal.cancel.done, { code: booking.code }));
      onOpenChange(false);
    },
  });
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(($) => $.portal.cancel.title, { code: booking.code })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t(($) => $.portal.cancel.description)}</AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor={`cancel-${booking.id}`}>
            {t(($) => $.portal.cancel.reason)}
          </FieldLabel>
          <Textarea
            id={`cancel-${booking.id}`}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>{t(($) => $.portal.cancel.keep)}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={cancel.isPending}
            onClick={(e) => {
              e.preventDefault();
              cancel.mutate();
            }}
          >
            {cancel.isPending ? <Spinner /> : null}
            {t(($) => $.portal.cancel.confirm)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
