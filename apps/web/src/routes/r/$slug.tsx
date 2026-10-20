import { zodResolver } from '@hookform/resolvers/zod';
import {
  type PublicLinkInfo,
  RegistrationBody,
} from '@rampflow/shared/modules/booking/api.carriers';
import { RegistrationCountry } from '@rampflow/shared/modules/booking/values';
import { values } from '@rampflow/shared/values';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { CircleAlertIcon, MailCheckIcon, MapPinIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';
import { AuthLayout } from '@/components/app-shell/auth-layout';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { api, call } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { useCountryName } from '@/modules/carriers/format';

// CR-02, TN-04: /r/$slug, the public booking link of one site. A carrier registers with company,
// country, contact name and email; the answer is the same whether or not the email has an account.

export const Route = createFileRoute('/r/$slug')({
  component: RegisterPage,
});

type RegistrationForm = z.input<typeof RegistrationBody>;

function RegisterPage() {
  const { t } = useTranslation('booking');
  const { slug } = Route.useParams();
  const link = useQuery({
    queryKey: ['public', 'links', slug],
    queryFn: () => call<PublicLinkInfo>(api.public.links[':slug'].$get({ param: { slug } })),
    retry: false,
    meta: { silent: true },
  });
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (link.isPending) {
    return (
      <AuthLayout title={t(($) => $.registration.page.title)}>
        <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          {t(($) => $.registration.page.loading)}
        </div>
      </AuthLayout>
    );
  }
  if (link.isError) {
    return (
      <AuthLayout title={t(($) => $.registration.page.title)}>
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>{t(($) => $.registration.page.unavailable_title)}</AlertTitle>
          <AlertDescription>{t(($) => $.registration.page.unavailable)}</AlertDescription>
        </Alert>
      </AuthLayout>
    );
  }
  const info = link.data;
  return (
    <AuthLayout
      title={t(($) => $.registration.page.title)}
      logoUrl={info.logoUrl}
      description={
        <span className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <MapPinIcon className="size-4" aria-hidden />
            {info.tenantName} · {info.siteName}, {info.city}
          </span>
          {t(($) => $.registration.page.description)}
        </span>
      }
    >
      {sentTo ? (
        <Alert>
          <MailCheckIcon />
          <AlertTitle>{t(($) => $.registration.page.sent_title)}</AlertTitle>
          <AlertDescription>
            {t(($) => $.registration.page.sent, { email: sentTo })}
          </AlertDescription>
        </Alert>
      ) : (
        <RegistrationFormView slug={slug} country={info.country} onSent={setSentTo} />
      )}
    </AuthLayout>
  );
}

function RegistrationFormView({
  slug,
  country,
  onSent,
}: {
  slug: string;
  country: string;
  onSent: (email: string) => void;
}) {
  const { t } = useTranslation('booking');
  const message = useFieldMessage();
  const locale = useLocale();
  const countryName = useCountryName();
  const countries = useMemo(
    () =>
      [...values(RegistrationCountry)]
        .map((code) => ({ code, name: countryName(code) }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [countryName, locale],
  );
  const form = useForm<RegistrationForm>({
    resolver: zodResolver(RegistrationBody),
    defaultValues: { companyName: '', country, contactName: '', email: '', locale },
  });
  const register = useMutation({
    mutationFn: (json: RegistrationForm) =>
      call(api.public.links[':slug'].registrations.$post({ param: { slug }, json })),
    onSuccess: (_, json) => onSent(json.email),
  });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((json) =>
        register.mutate(
          { ...json, locale },
          { onError: (e) => applyServerIssues(e, form.setError) },
        ),
      )}
    >
      <FieldGroup>
        <Controller
          name="companyName"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="register-company">
                {t(($) => $.registration.page.company)}
              </FieldLabel>
              <Input
                {...field}
                id="register-company"
                autoComplete="organization"
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{message(fieldState.error)}</FieldError>
            </Field>
          )}
        />
        <Controller
          name="country"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="register-country">
                {t(($) => $.registration.page.country)}
              </FieldLabel>
              <NativeSelect
                id="register-country"
                className="w-full"
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid}
              >
                {countries.map((c) => (
                  <NativeSelectOption key={c.code} value={c.code}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError>{message(fieldState.error)}</FieldError>
            </Field>
          )}
        />
        <Controller
          name="contactName"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="register-contact">
                {t(($) => $.registration.page.contact)}
              </FieldLabel>
              <Input
                {...field}
                id="register-contact"
                autoComplete="name"
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
              <FieldLabel htmlFor="register-email">
                {t(($) => $.registration.page.email)}
              </FieldLabel>
              <Input
                {...field}
                id="register-email"
                type="email"
                autoComplete="email"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>{t(($) => $.registration.page.email_hint)}</FieldDescription>
              <FieldError>{message(fieldState.error, 'email')}</FieldError>
            </Field>
          )}
        />
        <Button type="submit" size="lg" disabled={register.isPending}>
          {register.isPending ? <Spinner /> : null}
          {t(($) => $.registration.page.submit)}
        </Button>
      </FieldGroup>
    </form>
  );
}
