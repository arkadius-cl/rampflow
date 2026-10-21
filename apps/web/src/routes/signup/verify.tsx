import type { SignupInspect, SignupVerified } from '@rampflow/shared/modules/core/api.signup';
import { ConflictReason, ErrorCode, TokenExchangeStatus } from '@rampflow/shared/values';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { BuildingIcon, CircleAlertIcon, MailIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { errorText } from '@/components/app-shell/form-errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useExchangeOnce, useFragmentToken } from '@/hooks/use-fragment-token';
import { api, call, isFailure } from '@/lib/api';

// RG-02, RG-04: /signup/verify#<token>. Opening the link only shows the registration (login CSRF
// through a forwarded link); the company exists after the click, which also signs the person in.

export const Route = createFileRoute('/signup/verify')({
  component: VerifySignupPage,
});

function VerifySignupPage() {
  const { t } = useTranslation();
  const token = useFragmentToken();
  const inspect = useExchangeOnce(token && `signup-inspect:${token}`, () =>
    call<SignupInspect>(api.public.signups.inspect.$post({ json: { token: token ?? '' } })),
  );

  if (!token || inspect.status === TokenExchangeStatus.failed) {
    const failure = inspect.status === TokenExchangeStatus.failed ? inspect.error : null;
    return (
      <AuthLayout title={t(($) => $.signup.verify.title)}>
        {!token || isFailure(failure, ErrorCode.unauthorized) ? (
          <LinkInvalid />
        ) : (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{t(($) => $.errors.internal_error)}</AlertTitle>
          </Alert>
        )}
      </AuthLayout>
    );
  }
  if (inspect.status === TokenExchangeStatus.pending) {
    return (
      <AuthLayout title={t(($) => $.signup.verify.title)}>
        <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          {t(($) => $.signup.verify.loading)}
        </div>
      </AuthLayout>
    );
  }
  return <ConfirmSignup token={token} signup={inspect.value} />;
}

function ConfirmSignup({ token, signup }: { token: string; signup: SignupInspect }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const verify = useMutation({
    mutationFn: () => call<SignupVerified>(api.public.signups.verify.$post({ json: { token } })),
    meta: { silent: true },
    onSuccess: async ({ tenantId }) => {
      queryClient.removeQueries();
      await navigate({ to: '/t/$orgId', params: { orgId: tenantId }, replace: true });
    },
  });
  const failure = verify.error;

  if (isFailure(failure, ErrorCode.unauthorized)) {
    return (
      <AuthLayout title={t(($) => $.signup.verify.title)}>
        <LinkInvalid />
      </AuthLayout>
    );
  }
  if (
    isFailure(failure, ErrorCode.conflict) &&
    failure.conflictReason === ConflictReason.account_exists
  ) {
    return (
      <AuthLayout title={t(($) => $.signup.verify.title)}>
        <div className="flex flex-col gap-4">
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>{t(($) => $.signup.verify.account_exists_title)}</AlertTitle>
            <AlertDescription>{t(($) => $.signup.verify.account_exists)}</AlertDescription>
          </Alert>
          <Link to="/login" className={buttonVariants()}>
            {t(($) => $.signup.verify.sign_in)}
          </Link>
        </div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title={t(($) => $.signup.verify.title)}
      description={t(($) => $.signup.verify.confirm)}
    >
      <div className="flex flex-col gap-5">
        <dl className="flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <dt>
              <BuildingIcon className="size-4 text-muted-foreground" />
              <span className="sr-only">{t(($) => $.signup.form.company)}</span>
            </dt>
            <dd className="truncate font-medium">{signup.companyName}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>
              <MailIcon className="size-4 text-muted-foreground" />
              <span className="sr-only">{t(($) => $.signup.form.email)}</span>
            </dt>
            <dd className="truncate">{signup.email}</dd>
          </div>
        </dl>
        {failure ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{isFailure(failure) ? errorText(t, failure) : null}</AlertTitle>
          </Alert>
        ) : null}
        {signup.possibleDuplicate ? (
          <Alert>
            <TriangleAlertIcon />
            <AlertTitle>{t(($) => $.signup.verify.duplicate_title)}</AlertTitle>
            <AlertDescription>{t(($) => $.signup.verify.duplicate)}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          size="lg"
          variant={signup.possibleDuplicate ? 'outline' : 'default'}
          disabled={verify.isPending || verify.isSuccess}
          onClick={() => verify.mutate()}
        >
          {verify.isPending ? <Spinner /> : null}
          {signup.possibleDuplicate
            ? t(($) => $.signup.verify.create_anyway)
            : t(($) => $.signup.verify.create)}
        </Button>
      </div>
    </AuthLayout>
  );
}

function LinkInvalid() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>{t(($) => $.signup.verify.invalid_title)}</AlertTitle>
        <AlertDescription>{t(($) => $.signup.verify.invalid)}</AlertDescription>
      </Alert>
      <Link to="/signup" className={buttonVariants({ variant: 'outline' })}>
        {t(($) => $.signup.verify.register_again)}
      </Link>
    </div>
  );
}
