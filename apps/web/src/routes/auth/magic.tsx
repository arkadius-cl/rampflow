import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CircleAlertIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useExchangeOnce, useFragmentToken } from '@/hooks/use-fragment-token';
import { api, call } from '@/lib/api';

// CR-03: /auth/magic#<token> signs in once; the link expires after 15 minutes.

export const Route = createFileRoute('/auth/magic')({
  component: MagicLinkPage,
});

function MagicLinkPage() {
  const { t } = useTranslation();
  const token = useFragmentToken();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const exchange = useExchangeOnce(token && `magic:${token}`, () =>
    call(api.auth['magic-link'].exchange.$post({ json: { token: token ?? '' } })),
  );

  useEffect(() => {
    if (exchange.status !== 'done') return;
    queryClient.removeQueries();
    void navigate({ to: '/', replace: true });
  }, [exchange.status, navigate, queryClient]);

  if (token && exchange.status !== 'failed') {
    return (
      <AuthLayout title={t(($) => $.auth.magic.title)}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <Spinner />
          {t(($) => $.auth.magic.signing_in)}
        </div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={t(($) => $.auth.magic.title)}>
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t(($) => $.auth.link_invalid.title)}</AlertTitle>
          <AlertDescription>{t(($) => $.auth.link_invalid.magic)}</AlertDescription>
        </Alert>
        <Link to="/login" search={{ mode: 'magic' }} className={buttonVariants()}>
          {t(($) => $.auth.magic.request_submit)}
        </Link>
      </div>
    </AuthLayout>
  );
}
