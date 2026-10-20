import { zodResolver } from '@hookform/resolvers/zod';
import {
  type InvitationAcceptResponse,
  type InvitationInspectResponse,
  Password,
} from '@rampflow/shared/modules/core/api.auth';
import { SignInMode } from '@rampflow/shared/modules/core/values';
import { ErrorCode, TokenExchangeStatus } from '@rampflow/shared/values';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CircleAlertIcon, MailIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { applyServerIssues, errorText, useFieldMessage } from '@/components/app-shell/form-errors';
import { homeOf } from '@/components/app-shell/nav';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useExchangeOnce, useFragmentToken } from '@/hooks/use-fragment-token';
import { meQuery } from '@/lib/access';
import { ApiFailure, api, call, isFailure } from '@/lib/api';
import { useLocale } from '@/lib/i18n';

// PL-01, TN-01, CR-04 (acceptance): /invite#<token>. A new user sets name and password; a user
// with an account signs in on this page, then accepts. The token never leaves the fragment.

export const Route = createFileRoute('/invite')({
  component: InvitePage,
});

const NewAccount = z
  .object({ name: z.string().trim().min(1).max(120), password: Password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'password_match' });
type NewAccount = z.infer<typeof NewAccount>;

const SignIn = z.object({ password: z.string().min(1) });
type SignIn = z.infer<typeof SignIn>;

function InvitePage() {
  const { t } = useTranslation();
  const token = useFragmentToken();
  const inspect = useExchangeOnce(token && `inspect:${token}`, () =>
    call<InvitationInspectResponse>(
      api.public.invitations.inspect.$post({ json: { token: token ?? '' } }),
    ),
  );

  if (!token || inspect.status === TokenExchangeStatus.failed) {
    const expired =
      inspect.status === TokenExchangeStatus.failed &&
      isFailure(inspect.error, ErrorCode.unauthorized);
    return (
      <AuthLayout title={t(($) => $.auth.invite.title)}>
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{t(($) => $.auth.invite.invalid_title)}</AlertTitle>
            <AlertDescription>
              {expired || !token
                ? t(($) => $.auth.invite.invalid)
                : t(($) => $.errors.internal_error)}
            </AlertDescription>
          </Alert>
          <Link to="/login" className={buttonVariants({ variant: 'outline' })}>
            {t(($) => $.auth.back_to_login)}
          </Link>
        </div>
      </AuthLayout>
    );
  }
  if (inspect.status === TokenExchangeStatus.pending) {
    return (
      <AuthLayout title={t(($) => $.auth.invite.title)}>
        <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          {t(($) => $.auth.invite.loading)}
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
  invitation: InvitationInspectResponse;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const locale = useLocale();
  const me = useQuery({ ...meQuery, retry: false, meta: { silent: true } });
  const [needsSignIn, setNeedsSignIn] = useState(invitation.hasAccount);
  const signedInAsInvitee = me.data?.user.email.toLowerCase() === invitation.email.toLowerCase();

  const accept = useMutation({
    mutationFn: (body: { name?: string; password?: string }) =>
      call<InvitationAcceptResponse>(
        api.public.invitations.accept.$post({ json: { token, locale, ...body } }),
      ),
    meta: { silent: true },
    onSuccess: async (joined) => {
      queryClient.removeQueries();
      await navigate({
        href: homeOf({ ...joined, orgName: invitation.orgName, role: invitation.role }),
        replace: true,
      });
    },
    onError: (e) => {
      if (isFailure(e, ErrorCode.unauthorized) && e.reason === 'sign_in_required')
        setNeedsSignIn(true);
    },
  });

  const role = t(($) => $.shell.roles[invitation.role]);
  const failure = accept.error instanceof ApiFailure ? accept.error : null;
  return (
    <AuthLayout
      title={t(($) => $.auth.invite.title)}
      description={t(($) => $.auth.invite.summary, { org: invitation.orgName, role })}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <MailIcon className="size-4 text-muted-foreground" />
          <span className="truncate">{invitation.email}</span>
        </div>
        {failure &&
        failure.reason !== 'sign_in_required' &&
        failure.code !== ErrorCode.validation_failed ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>
              {failure.reason === 'already_member'
                ? t(($) => $.auth.invite.already_member)
                : failure.code === ErrorCode.unauthorized
                  ? t(($) => $.auth.invite.invalid)
                  : errorText(t, failure)}
            </AlertTitle>
          </Alert>
        ) : null}
        {me.isPending ? (
          <Spinner />
        ) : signedInAsInvitee ? (
          <Button size="lg" disabled={accept.isPending} onClick={() => accept.mutate({})}>
            {accept.isPending ? <Spinner /> : null}
            {t(($) => $.auth.invite.accept)}
          </Button>
        ) : needsSignIn ? (
          <SignInToAccept
            email={invitation.email}
            onSignedIn={async () => {
              await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
              accept.mutate({});
            }}
          />
        ) : (
          <NewAccountForm
            pending={accept.isPending}
            onSubmit={(body, setError) =>
              accept.mutate(body, { onError: (e) => applyServerIssues(e, setError) })
            }
          />
        )}
      </div>
    </AuthLayout>
  );
}

function NewAccountForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (
    body: { name: string; password: string },
    setError: ReturnType<typeof useForm<NewAccount>>['setError'],
  ) => void;
}) {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const form = useForm<NewAccount>({
    resolver: zodResolver(NewAccount),
    defaultValues: { name: '', password: '', confirm: '' },
  });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(({ name, password }) =>
        onSubmit({ name, password }, form.setError),
      )}
    >
      <FieldGroup>
        <p className="text-sm text-muted-foreground">{t(($) => $.auth.invite.new_account)}</p>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-name">{t(($) => $.auth.fields.name)}</FieldLabel>
              <Input
                {...field}
                id="invite-name"
                autoComplete="name"
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error, 'name')}</FieldError>
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-password">
                {t(($) => $.auth.fields.new_password)}
              </FieldLabel>
              <Input
                {...field}
                id="invite-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>{t(($) => $.auth.fields.password_hint)}</FieldDescription>
              <FieldError>{message(fieldState.error, 'password')}</FieldError>
            </Field>
          )}
        />
        <Controller
          name="confirm"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-confirm">
                {t(($) => $.auth.fields.confirm_password)}
              </FieldLabel>
              <Input
                {...field}
                id="invite-confirm"
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
          {t(($) => $.auth.invite.create_and_accept)}
        </Button>
      </FieldGroup>
    </form>
  );
}

/** An existing account signs in right here, so the token in this page's memory is not lost. */
function SignInToAccept({ email, onSignedIn }: { email: string; onSignedIn: () => Promise<void> }) {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const form = useForm<SignIn>({ resolver: zodResolver(SignIn), defaultValues: { password: '' } });
  const login = useMutation({
    mutationFn: (password: string) => call(api.auth.login.$post({ json: { email, password } })),
    meta: { silent: true },
    onSuccess: onSignedIn,
  });
  return (
    <form noValidate onSubmit={form.handleSubmit(({ password }) => login.mutate(password))}>
      <FieldGroup>
        <p className="text-sm text-muted-foreground">{t(($) => $.auth.invite.sign_in_first)}</p>
        {login.error ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>
              {isFailure(login.error, ErrorCode.rate_limited)
                ? t(($) => $.errors.rate_limited)
                : t(($) => $.auth.login.wrong)}
            </AlertTitle>
          </Alert>
        ) : null}
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="invite-signin-password">
                {t(($) => $.auth.fields.password)}
              </FieldLabel>
              <Input
                {...field}
                id="invite-signin-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error)}</FieldError>
            </Field>
          )}
        />
        <Button type="submit" size="lg" disabled={login.isPending}>
          {login.isPending ? <Spinner /> : null}
          {t(($) => $.auth.invite.sign_in_and_accept)}
        </Button>
        <Link
          to="/login"
          search={{ mode: SignInMode.reset }}
          target="_blank"
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t(($) => $.auth.login.forgot)}
        </Link>
      </FieldGroup>
    </form>
  );
}
