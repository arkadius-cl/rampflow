import { zodResolver } from '@hookform/resolvers/zod';
import {
  CarrierInvitationBody,
  type CarrierInvitationView,
} from '@rampflow/shared/modules/booking/api.carriers';
import { DisplayNamesType, StaffLocale, values } from '@rampflow/shared/values';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type * as z from 'zod';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { Button } from '@/components/ui/button';
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { api, call } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { OnboardingGate } from '@/modules/core/onboarding';
import { carrierKeys } from './queries';

type InviteForm = z.input<typeof CarrierInvitationBody>;

/** Each language named in itself, as the language menu does. */
const languageName = (locale: string) =>
  new Intl.DisplayNames([locale], { type: DisplayNamesType.language }).of(locale) ?? locale;

/** TN-03: invite a carrier company by name and email. */
export function InviteCarrierDialog({ orgId }: { orgId: string }) {
  const { t } = useTranslation('booking');
  const { t: tc } = useTranslation();
  const message = useFieldMessage();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm<InviteForm>({
    resolver: zodResolver(CarrierInvitationBody),
    defaultValues: { companyName: '', email: '', locale },
  });
  const invite = useMutation({
    mutationFn: (json: InviteForm) =>
      call<CarrierInvitationView>(
        api.t[':orgId'].carriers.invitations.$post({ param: { orgId }, json }),
      ),
    onSuccess: async (sent) => {
      toast.success(t(($) => $.carriers.invite.sent, { email: sent.email }));
      setOpen(false);
      form.reset({ companyName: '', email: '', locale });
      await queryClient.invalidateQueries({ queryKey: carrierKeys.all(orgId) });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <OnboardingGate reason={tc(($) => $.onboarding.gate.carriers)}>
        {(blocked) => (
          <DialogTrigger render={<Button size="sm" />} disabled={blocked}>
            <MailPlusIcon />
            {t(($) => $.carriers.invite.action)}
          </DialogTrigger>
        )}
      </OnboardingGate>
      <DialogContent>
        <form
          noValidate
          onSubmit={form.handleSubmit((json) =>
            invite.mutate(json, { onError: (e) => applyServerIssues(e, form.setError) }),
          )}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{t(($) => $.carriers.invite.title)}</DialogTitle>
            <DialogDescription>{t(($) => $.carriers.invite.description)}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Controller
              name="companyName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="invite-company">
                    {t(($) => $.carriers.invite.company)}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="invite-company"
                    autoComplete="organization"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError>{message(fieldState.error)}</FieldError>
                </Field>
              )}
            />
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="invite-email">
                    {t(($) => $.carriers.invite.email)}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="invite-email"
                    type="email"
                    autoComplete="email"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError>{message(fieldState.error, 'email')}</FieldError>
                </Field>
              )}
            />
            <Controller
              name="locale"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="invite-locale">
                    {t(($) => $.carriers.invite.language)}
                  </FieldLabel>
                  <NativeSelect
                    id="invite-locale"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    className="w-full"
                  >
                    {values(StaffLocale).map((l) => (
                      <NativeSelectOption key={l} value={l}>
                        {languageName(l)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t(($) => $.carriers.invite.cancel)}
            </DialogClose>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? <Spinner /> : null}
              {t(($) => $.carriers.invite.submit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
