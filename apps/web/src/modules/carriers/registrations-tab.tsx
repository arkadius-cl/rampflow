import { zodResolver } from '@hookform/resolvers/zod';
import {
  type RegistrationView,
  RejectRegistrationBody,
} from '@rampflow/shared/modules/booking/api.carriers';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { InboxIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useFieldMessage } from '@/components/app-shell/form-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, call } from '@/lib/api';
import { useCountryName, useDate } from './format';
import { carrierKeys, registrationsQuery } from './queries';
import { RegistrationStatusBadge } from './status';

/** TN-04: registrations through public links; pending ones are approved or rejected here. */
export function RegistrationsTab({ orgId }: { orgId: string }) {
  const { t } = useTranslation('booking');
  const { data } = useSuspenseQuery(registrationsQuery(orgId));
  const date = useDate();
  const country = useCountryName();
  if (data.items.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>{t(($) => $.carriers.registrations.empty_title)}</EmptyTitle>
          <EmptyDescription>{t(($) => $.carriers.registrations.empty)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Card className="py-0">
      <CardContent className="overflow-x-auto px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{t(($) => $.carriers.registrations.company)}</TableHead>
              <TableHead>{t(($) => $.carriers.registrations.contact)}</TableHead>
              <TableHead>{t(($) => $.carriers.registrations.site)}</TableHead>
              <TableHead>{t(($) => $.carriers.registrations.submitted)}</TableHead>
              <TableHead>{t(($) => $.carriers.registrations.status)}</TableHead>
              <TableHead className="pr-6 text-right">
                {t(($) => $.carriers.registrations.actions)}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-6">
                  <div className="font-medium">{r.companyName}</div>
                  <div className="text-xs text-muted-foreground">{country(r.country)}</div>
                </TableCell>
                <TableCell>
                  <div>{r.contactName}</div>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </TableCell>
                <TableCell>{r.siteName}</TableCell>
                <TableCell>{date(r.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <RegistrationStatusBadge status={r.status} />
                    {r.rejectReason ? (
                      <span className="max-w-60 text-xs text-muted-foreground">
                        {r.rejectReason}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="pr-6 text-right">
                  {r.status === 'pending_approval' ? (
                    <Decide orgId={orgId} registration={r} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Decide({ orgId, registration }: { orgId: string; registration: RegistrationView }) {
  const { t } = useTranslation('booking');
  const queryClient = useQueryClient();
  const approve = useMutation({
    mutationFn: () =>
      call<RegistrationView>(
        api.t[':orgId'].carriers.registrations[':registrationId'].approve.$post({
          param: { orgId, registrationId: registration.id },
        }),
      ),
    onSuccess: async () => {
      toast.success(
        t(($) => $.carriers.registrations.approved, { company: registration.companyName }),
      );
      await queryClient.invalidateQueries({ queryKey: carrierKeys.all(orgId) });
    },
  });
  return (
    <div className="flex justify-end gap-2">
      <RejectDialog orgId={orgId} registration={registration} />
      <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>
        {approve.isPending ? <Spinner /> : null}
        {t(($) => $.carriers.registrations.approve)}
      </Button>
    </div>
  );
}

function RejectDialog({ orgId, registration }: { orgId: string; registration: RegistrationView }) {
  const { t } = useTranslation('booking');
  const message = useFieldMessage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<RejectRegistrationBody>({
    resolver: zodResolver(RejectRegistrationBody),
    defaultValues: { reason: '' },
  });
  const reject = useMutation({
    mutationFn: (json: RejectRegistrationBody) =>
      call<RegistrationView>(
        api.t[':orgId'].carriers.registrations[':registrationId'].reject.$post({
          param: { orgId, registrationId: registration.id },
          json,
        }),
      ),
    onSuccess: async () => {
      toast.success(
        t(($) => $.carriers.registrations.rejected, { company: registration.companyName }),
      );
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: carrierKeys.all(orgId) });
    },
  });
  const id = `reject-reason-${registration.id}`;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        {t(($) => $.carriers.registrations.reject)}
      </DialogTrigger>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((json) => reject.mutate(json))}
        >
          <DialogHeader>
            <DialogTitle>
              {t(($) => $.carriers.registrations.reject_title, {
                company: registration.companyName,
              })}
            </DialogTitle>
            <DialogDescription>
              {t(($) => $.carriers.registrations.reject_description)}
            </DialogDescription>
          </DialogHeader>
          <Controller
            name="reason"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={id}>{t(($) => $.carriers.registrations.reason)}</FieldLabel>
                <Textarea {...field} id={id} rows={3} aria-invalid={fieldState.invalid} />
                <FieldDescription>{registration.email}</FieldDescription>
                <FieldError>{message(fieldState.error)}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t(($) => $.carriers.registrations.cancel)}
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={reject.isPending}>
              {reject.isPending ? <Spinner /> : null}
              {t(($) => $.carriers.registrations.reject_submit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
