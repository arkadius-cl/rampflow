import { BookingStatus } from '@rampflow/shared/modules/booking/values';
import type { YardTruck } from '@rampflow/shared/modules/yard/api';
import { LogOutIcon } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { useYardMutation, yardApi } from './queries';

// YD-05: departure from any on-site state; before `done` it needs a reason.

export function CheckOutDialog({
  orgId,
  truck,
  online,
  onDone,
}: {
  orgId: string;
  truck: YardTruck;
  online: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation('yard');
  const [reason, setReason] = useState('');
  const needsReason = truck.status !== BookingStatus.done;
  const depart = useYardMutation(
    orgId,
    () => yardApi(orgId).depart(truck.id, needsReason ? reason.trim() : undefined),
    {
      onSuccess: () => {
        toast.success(t(($) => $.gate.check_out.done, { carrier: truck.carrierName }));
        onDone();
      },
    },
  );
  return (
    <DialogContent className="sm:max-w-lg" data-density="touch" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle className="text-xl">
          {t(($) => $.gate.check_out.title, { carrier: truck.carrierName })}
        </DialogTitle>
        <DialogDescription>{t(($) => $.gate.check_out.description)}</DialogDescription>
      </DialogHeader>
      {needsReason ? (
        <Field>
          <FieldLabel htmlFor="depart-reason">{t(($) => $.gate.check_out.reason)}</FieldLabel>
          <Textarea
            id="depart-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      ) : null}
      <DialogFooter className="items-center">
        {!online ? (
          <span className="mr-auto text-sm text-tone-danger">{t(($) => $.gate.offline)}</span>
        ) : null}
        <Button variant="ghost" size="lg" onClick={onDone}>
          {t(($) => $.gate.check_in.cancel)}
        </Button>
        <Button
          size="lg"
          className="h-12 min-w-40"
          disabled={!online || depart.isPending || (needsReason && reason.trim() === '')}
          onClick={() => depart.mutate(undefined)}
        >
          <LogOutIcon /> {t(($) => $.gate.check_out.confirm)}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
