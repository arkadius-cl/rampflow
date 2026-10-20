import { zodResolver } from '@hookform/resolvers/zod';
import { ErrorCode } from '@rampflow/shared/values';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlertIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { useFieldMessage } from '@/components/app-shell/form-errors';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { meQuery } from '@/lib/access';
import { api, call, isFailure } from '@/lib/api';

const SignIn = z.object({ password: z.string().min(1) });
type SignIn = z.infer<typeof SignIn>;

/**
 * An account with the token's email signs in on the token page itself, so the token held in
 * this page's memory is not lost; `onSignedIn` then redeems it.
 */
export function TokenSignIn({
  email,
  intro,
  submit,
  wrong,
  onSignedIn,
  children,
}: {
  email: string;
  intro: string;
  submit: string;
  wrong: string;
  onSignedIn: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const message = useFieldMessage();
  const queryClient = useQueryClient();
  const form = useForm<SignIn>({ resolver: zodResolver(SignIn), defaultValues: { password: '' } });
  const login = useMutation({
    mutationFn: (password: string) => call(api.auth.login.$post({ json: { email, password } })),
    meta: { silent: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
      onSignedIn();
    },
  });
  return (
    <form noValidate onSubmit={form.handleSubmit(({ password }) => login.mutate(password))}>
      <FieldGroup>
        <p className="text-sm text-muted-foreground">{intro}</p>
        {login.error ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>
              {isFailure(login.error, ErrorCode.rate_limited)
                ? t(($) => $.errors.rate_limited)
                : wrong}
            </AlertTitle>
          </Alert>
        ) : null}
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="token-signin-password">
                {t(($) => $.auth.fields.password)}
              </FieldLabel>
              <Input
                {...field}
                id="token-signin-password"
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
          {submit}
        </Button>
        {children}
      </FieldGroup>
    </form>
  );
}
