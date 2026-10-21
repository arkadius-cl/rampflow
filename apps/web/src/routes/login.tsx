import { zodResolver } from '@hookform/resolvers/zod';
import { Email, type EmailLinkBody, LoginBody } from '@rampflow/shared/modules/core/api.auth';
import { EmailLinkMode, SignInMode } from '@rampflow/shared/modules/core/values';
import { ErrorCode } from '@rampflow/shared/values';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CircleAlertIcon, MailCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { useFieldMessage } from '@/components/app-shell/form-errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, call, isFailure } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';

// CR-03: sign in by password, or ask for a magic link or a password reset by email.

const LoginSearch = z.object({
  redirect: z.string().optional().catch(undefined),
  mode: z.enum(SignInMode).optional().catch(undefined),
});

/** Only same-app paths, so a crafted link cannot send a signed-in user elsewhere. */
const safeRedirect = (to: string | undefined) =>
  to?.startsWith('/') && !to.startsWith('//') && !to.startsWith('/login') ? to : '/';

export const Route = createFileRoute('/login')({
  validateSearch: LoginSearch,
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { mode = SignInMode.password, redirect } = Route.useSearch();
  const titles = {
    password: t(($) => $.auth.login.title),
    magic: t(($) => $.auth.magic.request_title),
    reset: t(($) => $.auth.reset.request_title),
  };
  return (
    <AuthLayout title={titles[mode]}>
      {mode === SignInMode.password ? (
        <PasswordForm redirect={safeRedirect(redirect)} />
      ) : (
        <EmailLinkForm key={mode} kind={mode} />
      )}
    </AuthLayout>
  );
}

function PasswordForm({ redirect }: { redirect: string }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const message = useFieldMessage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<LoginBody>({
    resolver: zodResolver(LoginBody),
    defaultValues: { email: '', password: '' },
  });
  const login = useMutation({
    mutationFn: (body: LoginBody) => call(api.auth.login.$post({ json: body })),
    meta: { silent: true },
    onSuccess: async () => {
      queryClient.removeQueries();
      await queryClient.fetchQuery({
        queryKey: queryKeys.me(),
        queryFn: () => call(api.me.$get()),
      });
      await navigate({ href: redirect });
    },
  });
  const failure = login.error;
  const retryMinutes =
    isFailure(failure, ErrorCode.rate_limited) &&
    typeof failure.details.retryAfterSeconds === 'number'
      ? Math.ceil(failure.details.retryAfterSeconds / 60)
      : null;

  return (
    <form noValidate onSubmit={form.handleSubmit((body) => login.mutate(body))}>
      <FieldGroup>
        {failure ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>
              {retryMinutes !== null
                ? t(($) => $.auth.login.rate_limited, {
                    when: new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
                      retryMinutes,
                      'minute',
                    ),
                  })
                : isFailure(failure, ErrorCode.unauthorized)
                  ? t(($) => $.auth.login.wrong)
                  : t(($) => $.errors.internal_error)}
            </AlertTitle>
          </Alert>
        ) : null}
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-email">{t(($) => $.auth.fields.email)}</FieldLabel>
              <Input
                {...field}
                id="login-email"
                type="email"
                autoComplete="username"
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error, 'email')}</FieldError>
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="login-password">{t(($) => $.auth.fields.password)}</FieldLabel>
                <Link
                  to="/login"
                  search={{ mode: SignInMode.reset }}
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  {t(($) => $.auth.login.forgot)}
                </Link>
              </div>
              <Input
                {...field}
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error, 'password')}</FieldError>
            </Field>
          )}
        />
        <Button type="submit" size="lg" disabled={login.isPending}>
          {login.isPending ? <Spinner /> : null}
          {t(($) => $.auth.login.submit)}
        </Button>
        <Link
          to="/login"
          search={{ mode: SignInMode.magic }}
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          {t(($) => $.auth.login.magic_instead)}
        </Link>
        <Link to="/signup" className={buttonVariants({ variant: 'link' })}>
          {t(($) => $.auth.login.register)}
        </Link>
      </FieldGroup>
    </form>
  );
}

const EmailOnly = z.object({ email: Email });
type EmailOnly = z.infer<typeof EmailOnly>;

/** Asks for a magic link or a reset link. The answer is the same whether or not the email exists. */
function EmailLinkForm({ kind }: { kind: EmailLinkMode }) {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const locale = useLocale();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<EmailOnly>({
    resolver: zodResolver(EmailOnly),
    defaultValues: { email: '' },
  });
  const request = useMutation({
    mutationFn: (body: EmailLinkBody) =>
      call(
        kind === EmailLinkMode.magic
          ? api.auth['magic-link'].$post({ json: body })
          : api.auth['password-reset'].$post({ json: body }),
      ),
    onSuccess: (_data, body) => setSentTo(body.email),
  });

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <MailCheckIcon />
          <AlertTitle>{t(($) => $.auth.sent.title)}</AlertTitle>
          <AlertDescription>
            {kind === EmailLinkMode.magic
              ? t(($) => $.auth.sent.magic, { email: sentTo })
              : t(($) => $.auth.sent.reset, { email: sentTo })}
          </AlertDescription>
        </Alert>
        <Link to="/login" className={buttonVariants({ variant: 'outline' })}>
          {t(($) => $.auth.back_to_login)}
        </Link>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(({ email }) => request.mutate({ email, locale }))}>
      <FieldGroup>
        <p className="text-sm text-muted-foreground">
          {kind === EmailLinkMode.magic
            ? t(($) => $.auth.magic.request_hint)
            : t(($) => $.auth.reset.request_hint)}
        </p>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="link-email">{t(($) => $.auth.fields.email)}</FieldLabel>
              <Input
                {...field}
                id="link-email"
                type="email"
                autoComplete="username"
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error, 'email')}</FieldError>
            </Field>
          )}
        />
        <Button type="submit" size="lg" disabled={request.isPending}>
          {request.isPending ? <Spinner /> : null}
          {kind === EmailLinkMode.magic
            ? t(($) => $.auth.magic.request_submit)
            : t(($) => $.auth.reset.request_submit)}
        </Button>
        <Link to="/login" className={buttonVariants({ variant: 'ghost' })}>
          {t(($) => $.auth.back_to_login)}
        </Link>
      </FieldGroup>
    </form>
  );
}
