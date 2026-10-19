import { zodResolver } from '@hookform/resolvers/zod';
import type {
  CarrierInvitationAccepted,
  CarrierInvitationInspect,
} from '@rampflow/shared/modules/booking/api.carriers';
import { Password } from '@rampflow/shared/modules/core/api.auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CircleAlertIcon, MailIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { applyServerIssues, errorText, useFieldMessage } from '@/components/app-shell/form-errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useExchangeOnce, useFragmentToken } from '@/hooks/use-fragment-token';
import { meQuery } from '@/lib/access';
import { ApiFailure, api, call, isFailure } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { TokenSignIn } from '@/modules/carriers/sign-in-form';

// TN-03, CR-01: /carrier-invite#<token>. A new user enters name, company and password; a user
// with an account signs in here, then accepts. The token never leaves the fragment.

export const Route = createFileRoute('/carrier-invite')({
  component: CarrierInvitePage,
});

const NewAccount = z
  .object({
    name: z.string().trim().min(1).max(120),
    companyName: z.string().trim().min(1).max(120),
    password: Password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'password_match' });
type NewAccount = z.infer<typeof NewAccount>;

function CarrierInvitePage() {
  const { t } = useTranslation('booking');
  const { t: core } = useTranslation('core');
  const token = useFragmentToken();
  const inspect = useExchangeOnce(token && `carrier-inspect:${token}`, () =>
    call<CarrierInvitationInspect>(
      api.public['carrier-invitations'].inspect.$post({ json: { token: token ?? '' } }),
    ),
  );
  if (!token || inspect.status === 'failed') {
    const known = inspect.status === 'failed' && !isFailure(inspect.error, 'unauthorized');
    return (
      <AuthLayout title={t(($) => $.carriers.accept.title)}>
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{t(($) => $.carriers.accept.invalid_title)}</AlertTitle>
            <AlertDescription>
              {known ? core(($) => $.errors.internal_error) : t(($) => $.carriers.accept.invalid)}
            </AlertDescription>
          </Alert>
          <Link to="/login" className={buttonVariants({ variant: 'outline' })}>
            {t(($) => $.carriers.accept.back)}
          </Link>
        </div>
      </AuthLayout>
    );
  }
  if (inspect.status === 'pending') {
    return (
      <AuthLayout title={t(($) => $.carriers.accept.title)}>
        <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          {t(($) => $.carriers.accept.loading)}
        </div>
      </AuthLayout>
    );
  }
  return <Invitation token={token} invitation={inspect.value} />;
}

function Invitation({
  token,
  invitation,
}: {
  token: string;
  invitation: CarrierInvitationInspect;
}) {
  const { t } = useTranslation('booking');
  const { t: core } = useTranslation('core');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const locale = useLocale();
  const me = useQuery({ ...meQuery, retry: false, meta: { silent: true } });
  const [needsSignIn, setNeedsSignIn] = useState(invitation.hasAccount);
  const signedInAsInvitee = me.data?.user.email.toLowerCase() === invitation.email.toLowerCase();

  const accept = useMutation({
    mutationFn: (body: { name?: string; password?: string; companyName?: string }) =>
      call<CarrierInvitationAccepted>(
        api.public['carrier-invitations'].accept.$post({ json: { token, locale, ...body } }),
      ),
    meta: { silent: true },
    onSuccess: async ({ carrierId }) => {
      queryClient.removeQueries();
      await navigate({ to: '/c/$orgId/tenants', params: { orgId: carrierId }, replace: true });
    },
    onError: (e) => {
      if (isFailure(e, 'unauthorized') && e.reason === 'sign_in_required') setNeedsSignIn(true);
    },
  });

  const failure = accept.error instanceof ApiFailure ? accept.error : null;
  return (
    <AuthLayout
      title={t(($) => $.carriers.accept.title)}
      description={t(($) => $.carriers.accept.summary, {
        tenant: invitation.tenantName,
        company: invitation.companyName,
      })}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <MailIcon className="size-4 text-muted-foreground" />
          <span className="truncate">{invitation.email}</span>
        </div>
        {failure &&
        failure.reason !== 'sign_in_required' &&
        failure.code !== 'validation_failed' ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>
              {failure.code === 'unauthorized'
                ? t(($) => $.carriers.accept.invalid)
                : errorText(core, failure)}
            </AlertTitle>
          </Alert>
        ) : null}
        {me.isPending ? (
          <Spinner />
        ) : signedInAsInvitee ? (
          <Button size="lg" disabled={accept.isPending} onClick={() => accept.mutate({})}>
            {accept.isPending ? <Spinner /> : null}
            {t(($) => $.carriers.accept.accept)}
          </Button>
        ) : needsSignIn ? (
          <TokenSignIn
            email={invitation.email}
            intro={t(($) => $.carriers.accept.sign_in_first)}
            submit={t(($) => $.carriers.accept.sign_in_and_accept)}
            wrong={t(($) => $.carriers.accept.wrong)}
            onSignedIn={() => accept.mutate({})}
          />
        ) : (
          <NewAccountForm
            companyName={invitation.companyName}
            pending={accept.isPending}
            onSubmit={(body, setError) =>
              accept.mutate(body, { onError: (e) => applyServerIssues(e, setError) })
            }
          />
        )}
        <p className="text-center text-xs text-muted-foreground">
          {t(($) => $.carriers.accept.free)}
        </p>
      </div>
    </AuthLayout>
  );
}

function NewAccountForm({
  companyName,
  pending,
  onSubmit,
}: {
  companyName: string;
  pending: boolean;
  onSubmit: (
    body: { name: string; password: string; companyName: string },
    setError: ReturnType<typeof useForm<NewAccount>>['setError'],
  ) => void;
}) {
  const { t } = useTranslation('booking');
  const { t: core } = useTranslation('core');
  const message = useFieldMessage();
  const form = useForm<NewAccount>({
    resolver: zodResolver(NewAccount),
    defaultValues: { name: '', companyName, password: '', confirm: '' },
  });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(({ name, password, companyName: company }) =>
        onSubmit({ name, password, companyName: company }, form.setError),
      )}
    >
      <FieldGroup>
        <p className="text-sm text-muted-foreground">{t(($) => $.carriers.accept.new_account)}</p>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="carrier-invite-name">
                {t(($) => $.carriers.accept.name)}
              </FieldLabel>
              <Input
                {...field}
                id="carrier-invite-name"
                autoComplete="name"
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error, 'name')}</FieldError>
            </Field>
          )}
        />
        <Controller
          name="companyName"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="carrier-invite-company">
                {t(($) => $.carriers.accept.company)}
              </FieldLabel>
              <Input
                {...field}
                id="carrier-invite-company"
                autoComplete="organization"
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error)}</FieldError>
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="carrier-invite-password">
                {core(($) => $.auth.fields.new_password)}
              </FieldLabel>
              <Input
                {...field}
                id="carrier-invite-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>{core(($) => $.auth.fields.password_hint)}</FieldDescription>
              <FieldError>{message(fieldState.error, 'password')}</FieldError>
            </Field>
          )}
        />
        <Controller
          name="confirm"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="carrier-invite-confirm">
                {core(($) => $.auth.fields.confirm_password)}
              </FieldLabel>
              <Input
                {...field}
                id="carrier-invite-confirm"
                type="password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error, 'confirm')}</FieldError>
            </Field>
          )}
        />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner /> : null}
          {t(($) => $.carriers.accept.submit)}
        </Button>
      </FieldGroup>
    </form>
  );
}
