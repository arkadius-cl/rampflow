import type { RegistrationVerified } from '@rampflow/shared/modules/booking/api.carriers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CircleAlertIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useExchangeOnce, useFragmentToken } from '@/hooks/use-fragment-token';
import { api, call, isFailure } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { TokenSignIn } from '@/modules/carriers/sign-in-form';

// CR-02: /carrier-registration#<token> confirms the email of a public-link registration and signs
// the carrier in. An email that already has an account signs in here first; the registration
// then joins that user's company.

export const Route = createFileRoute('/carrier-registration')({
  component: VerifyRegistrationPage,
});

function VerifyRegistrationPage() {
  const { t } = useTranslation('booking');
  const token = useFragmentToken();
  const locale = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const verify = () =>
    call<RegistrationVerified>(
      api.public.registrations.verify.$post({ json: { token: token ?? '', locale } }),
    );
  const first = useExchangeOnce(token && `registration:${token}`, verify);
  const retry = useMutation({ mutationFn: verify, meta: { silent: true } });
  const done = retry.data ?? (first.status === 'done' ? first.value : undefined);

  useEffect(() => {
    if (!done) return;
    queryClient.removeQueries();
    void navigate({ to: '/c/$orgId/tenants', params: { orgId: done.carrierId }, replace: true });
  }, [done, navigate, queryClient]);

  const failure = retry.error ?? (first.status === 'failed' ? first.error : null);
  const signInEmail =
    isFailure(failure, 'unauthorized') &&
    failure.reason === 'sign_in_required' &&
    typeof failure.details.email === 'string'
      ? failure.details.email
      : null;

  if (token && (done || retry.isPending || (first.status === 'pending' && !failure))) {
    return (
      <AuthLayout title={t(($) => $.registration.verify.title)}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <Spinner />
          {t(($) => $.registration.verify.verifying)}
        </div>
      </AuthLayout>
    );
  }
  if (token && signInEmail) {
    return (
      <AuthLayout title={t(($) => $.registration.verify.title)}>
        <SignInToConfirm email={signInEmail} onSignedIn={() => retry.mutate()} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={t(($) => $.registration.verify.title)}>
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>{t(($) => $.registration.verify.invalid_title)}</AlertTitle>
        <AlertDescription>{t(($) => $.registration.verify.invalid)}</AlertDescription>
      </Alert>
    </AuthLayout>
  );
}

function SignInToConfirm({ email, onSignedIn }: { email: string; onSignedIn: () => void }) {
  const { t } = useTranslation('booking');
  return (
    <TokenSignIn
      email={email}
      intro={t(($) => $.registration.verify.sign_in_first)}
      submit={t(($) => $.registration.verify.sign_in_and_confirm)}
      wrong={t(($) => $.registration.verify.wrong)}
      onSignedIn={onSignedIn}
    >
      <p className="text-center text-xs text-muted-foreground">
        {t(($) => $.registration.verify.no_password)}
      </p>
      <Link
        to="/login"
        search={{ mode: 'magic' }}
        target="_blank"
        className={buttonVariants({ variant: 'link', size: 'sm' })}
      >
        {t(($) => $.registration.verify.magic)}
      </Link>
    </TokenSignIn>
  );
}
