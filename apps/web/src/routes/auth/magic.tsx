import type { MagicLinkInspect } from '@rampflow/shared/modules/core/api.auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CircleAlertIcon, MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useFragmentToken } from '@/hooks/use-fragment-token';
import { api, call } from '@/lib/api';

// CR-03: /auth/magic#<token> signs in once; the link expires after 15 minutes. The page names the
// account and signs in only on a click, so a link to someone else's account cannot switch this
// browser to that account silently (login CSRF).

export const Route = createFileRoute('/auth/magic')({
  component: MagicLinkPage,
});

function MagicLinkPage() {
  const { t } = useTranslation();
  const token = useFragmentToken();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inspect = useQuery({
    queryKey: ['auth', 'magic-link', token],
    queryFn: () =>
      call<MagicLinkInspect>(
        api.auth['magic-link'].inspect.$post({ json: { token: token ?? '' } }),
      ),
    enabled: token !== null,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    meta: { silent: true },
  });
  const exchange = useMutation({
    mutationFn: () => call(api.auth['magic-link'].exchange.$post({ json: { token: token ?? '' } })),
    meta: { silent: true },
    onSuccess: async () => {
      queryClient.removeQueries();
      await navigate({ to: '/', replace: true });
    },
  });

  if (token && inspect.isPending) {
    return (
      <AuthLayout title={t(($) => $.auth.magic.title)}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <Spinner />
          {t(($) => $.auth.magic.checking)}
        </div>
      </AuthLayout>
    );
  }
  if (token && inspect.data && !exchange.isError) {
    const { email } = inspect.data;
    return (
      <AuthLayout title={t(($) => $.auth.magic.title)} description={t(($) => $.auth.magic.confirm)}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <MailIcon className="size-4 text-muted-foreground" />
            <span className="truncate">{email}</span>
          </div>
          <Button
            size="lg"
            disabled={exchange.isPending || exchange.isSuccess}
            onClick={() => exchange.mutate()}
          >
            {exchange.isPending ? <Spinner /> : null}
            {t(($) => $.auth.magic.continue_as, { email })}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t(($) => $.auth.magic.not_you)}
          </p>
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
