import { zodResolver } from '@hookform/resolvers/zod';
import { Password } from '@rampflow/shared/modules/core/api.auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { CircleAlertIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import * as z from 'zod';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useFragmentToken } from '@/hooks/use-fragment-token';
import { api, call, isFailure } from '@/lib/api';

// CR-03: /auth/reset#<token> sets a new password. Every other session of the user ends.

const NewPassword = z
  .object({ password: Password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'password_match' });
type NewPassword = z.infer<typeof NewPassword>;

export const Route = createFileRoute('/auth/reset')({
  component: ResetPage,
});

function InvalidLink() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>{t(($) => $.auth.link_invalid.title)}</AlertTitle>
        <AlertDescription>{t(($) => $.auth.link_invalid.reset)}</AlertDescription>
      </Alert>
      <Link to="/login" search={{ mode: 'reset' }} className={buttonVariants()}>
        {t(($) => $.auth.reset.request_submit)}
      </Link>
    </div>
  );
}

function ResetPage() {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const token = useFragmentToken();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<NewPassword>({
    resolver: zodResolver(NewPassword),
    defaultValues: { password: '', confirm: '' },
  });
  const confirm = useMutation({
    mutationFn: (password: string) =>
      call(api.auth['password-reset'].confirm.$post({ json: { token: token ?? '', password } })),
    meta: { silent: true },
    onSuccess: async () => {
      queryClient.removeQueries();
      toast.success(t(($) => $.auth.reset.done));
      await navigate({ to: '/', replace: true });
    },
    onError: (e) => applyServerIssues(e, form.setError),
  });

  if (!token || isFailure(confirm.error, 'unauthorized')) {
    return (
      <AuthLayout title={t(($) => $.auth.reset.title)}>
        <InvalidLink />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={t(($) => $.auth.reset.title)}>
      <form noValidate onSubmit={form.handleSubmit(({ password }) => confirm.mutate(password))}>
        <FieldGroup>
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="reset-password">
                  {t(($) => $.auth.fields.new_password)}
                </FieldLabel>
                <Input
                  {...field}
                  id="reset-password"
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
                <FieldLabel htmlFor="reset-confirm">
                  {t(($) => $.auth.fields.confirm_password)}
                </FieldLabel>
                <Input
                  {...field}
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                />
                <FieldError>{message(fieldState.error, 'confirm')}</FieldError>
              </Field>
            )}
          />
          <Button type="submit" size="lg" disabled={confirm.isPending}>
            {confirm.isPending ? <Spinner /> : null}
            {t(($) => $.auth.reset.submit)}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
