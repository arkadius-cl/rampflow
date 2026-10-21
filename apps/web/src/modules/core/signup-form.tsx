import { zodResolver } from '@hookform/resolvers/zod';
import {
  SignupBody,
  type SignupForm as SignupValues,
} from '@rampflow/shared/modules/core/api.signup';
import { taxIdTypeFits, vatPrefix } from '@rampflow/shared/modules/core/tax-id';
import { EuCountry, Salutation, TaxIdType } from '@rampflow/shared/modules/core/values';
import { DisplayNamesType, isValueOf, StaffLocale, values } from '@rampflow/shared/values';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { MailCheckIcon } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { applyServerIssues, useFieldMessage } from '@/components/app-shell/form-errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { api, call } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { AltchaField } from './altcha-field';

// RG-01, design decision 15: the registration form and its "Check your inbox" screen. The form
// stays mounted, hidden, behind that screen, so "Send again" re-submits the kept values through
// the same path, with a fresh proof of work.

/** The radio value of "No answer"; the body carries `null`. */
const NO_SALUTATION = '';

const homeCountry = (locale: StaffLocale): EuCountry =>
  locale === StaffLocale.pl ? EuCountry.PL : EuCountry.DE;

export function SignupForm() {
  const { t } = useTranslation();
  const locale = useLocale();
  const message = useFieldMessage();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sentAgain, setSentAgain] = useState(false);
  // A new key remounts the ALTCHA widget: the API accepts each solution once.
  const [attempt, setAttempt] = useState(0);

  const form = useForm<SignupValues, unknown, SignupBody>({
    resolver: zodResolver(SignupBody),
    defaultValues: {
      salutation: null,
      givenName: '',
      familyName: '',
      email: '',
      password: '',
      companyName: '',
      country: homeCountry(locale),
      taxIdType: TaxIdType.eu_vat,
      taxIdValue: '',
      altcha: '',
    },
  });
  const country = useWatch({ control: form.control, name: 'country' });
  const taxIdType = useWatch({ control: form.control, name: 'taxIdType' });

  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: DisplayNamesType.region });
    return values(EuCountry)
      .map((code) => ({ code, name: names.of(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  const taxIdTypes = values(TaxIdType).filter((type) => taxIdTypeFits(type, country));

  const submit = useMutation({
    mutationFn: (body: SignupBody) => call(api.public.signups.$post({ json: body })),
    onSuccess: (_data, body) => {
      setSentAgain(sentTo !== null);
      setSentTo(body.email);
    },
    onError: (error) => {
      setSentTo(null);
      applyServerIssues(error, form.setError);
    },
    onSettled: () => {
      form.setValue('altcha', '');
      setAttempt((n) => n + 1);
    },
  });

  return (
    <>
      {sentTo ? (
        <div className="flex flex-col gap-4">
          <Alert>
            <MailCheckIcon />
            <AlertTitle>{t(($) => $.signup.sent.title)}</AlertTitle>
            <AlertDescription>{t(($) => $.signup.sent.body, { email: sentTo })}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground" role="status">
            {sentAgain ? t(($) => $.signup.sent.again_done) : t(($) => $.signup.sent.no_email)}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={submit.isPending}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {submit.isPending ? <Spinner /> : null}
            {t(($) => $.signup.sent.again)}
          </Button>
        </div>
      ) : null}
      <form
        ref={formRef}
        noValidate
        hidden={sentTo !== null}
        onSubmit={form.handleSubmit((body) => submit.mutate({ ...body, locale }))}
      >
        <FieldGroup>
          <Controller
            name="salutation"
            control={form.control}
            render={({ field }) => (
              <FieldSet>
                <FieldLegend variant="label">{t(($) => $.signup.form.salutation)}</FieldLegend>
                <RadioGroup
                  value={field.value ?? NO_SALUTATION}
                  onValueChange={(v) => field.onChange(isValueOf(Salutation, v) ? v : null)}
                  className="flex flex-wrap gap-4"
                >
                  {[NO_SALUTATION, ...values(Salutation)].map((value) => (
                    <Field key={value} orientation="horizontal" className="w-auto">
                      <RadioGroupItem value={value} id={`${id}-salutation-${value}`} />
                      <FieldLabel htmlFor={`${id}-salutation-${value}`} className="font-normal">
                        {isValueOf(Salutation, value)
                          ? t(($) => $.signup.form.salutations[value])
                          : t(($) => $.signup.form.salutations.none)}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              </FieldSet>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="givenName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-given`}>
                    {t(($) => $.signup.form.given_name)}
                  </FieldLabel>
                  <Input
                    {...field}
                    id={`${id}-given`}
                    autoComplete="given-name"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError>{message(fieldState.error)}</FieldError>
                </Field>
              )}
            />
            <Controller
              name="familyName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${id}-family`}>
                    {t(($) => $.signup.form.family_name)}
                  </FieldLabel>
                  <Input
                    {...field}
                    id={`${id}-family`}
                    autoComplete="family-name"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError>{message(fieldState.error)}</FieldError>
                </Field>
              )}
            />
          </div>
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${id}-email`}>{t(($) => $.signup.form.email)}</FieldLabel>
                <Input
                  {...field}
                  id={`${id}-email`}
                  type="email"
                  autoComplete="email"
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
                <FieldLabel htmlFor={`${id}-password`}>
                  {t(($) => $.signup.form.password)}
                </FieldLabel>
                <Input
                  {...field}
                  id={`${id}-password`}
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>{t(($) => $.signup.form.password_hint)}</FieldDescription>
                <FieldError>{message(fieldState.error, 'password')}</FieldError>
              </Field>
            )}
          />
          <Controller
            name="companyName"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${id}-company`}>{t(($) => $.signup.form.company)}</FieldLabel>
                <Input
                  {...field}
                  id={`${id}-company`}
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
                <FieldLabel htmlFor={`${id}-country`}>{t(($) => $.signup.form.country)}</FieldLabel>
                <NativeSelect
                  {...field}
                  id={`${id}-country`}
                  className="w-full"
                  autoComplete="country"
                  aria-invalid={fieldState.invalid}
                  onChange={(e) => {
                    const next = e.target.value as EuCountry;
                    field.onChange(next);
                    if (!taxIdTypeFits(form.getValues('taxIdType'), next)) {
                      form.setValue('taxIdType', TaxIdType.eu_vat);
                    }
                  }}
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
            name="taxIdType"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${id}-tax-type`}>
                  {t(($) => $.signup.form.tax_id_type)}
                </FieldLabel>
                <NativeSelect
                  {...field}
                  id={`${id}-tax-type`}
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                >
                  {taxIdTypes.map((type) => (
                    <NativeSelectOption key={type} value={type}>
                      {t(($) => $.signup.form.tax_id_types[type])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError>{message(fieldState.error)}</FieldError>
              </Field>
            )}
          />
          <Controller
            name="taxIdValue"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${id}-tax-value`}>
                  {t(($) => $.signup.form.tax_id_value)}
                </FieldLabel>
                <Input
                  {...field}
                  id={`${id}-tax-value`}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>
                  <TaxIdExample type={taxIdType} country={country} />
                </FieldDescription>
                <FieldError>{message(fieldState.error)}</FieldError>
              </Field>
            )}
          />
          <AltchaField key={attempt} control={form.control} />
          <Button type="submit" size="lg" disabled={submit.isPending}>
            {submit.isPending ? <Spinner /> : null}
            {t(($) => $.signup.form.submit)}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t(($) => $.signup.form.have_account)}{' '}
            <Link to="/login" className={buttonVariants({ variant: 'link', className: 'px-0' })}>
              {t(($) => $.signup.form.sign_in)}
            </Link>
          </p>
        </FieldGroup>
      </form>
    </>
  );
}

function TaxIdExample({ type, country }: { type: TaxIdType; country: EuCountry }) {
  const { t } = useTranslation();
  switch (type) {
    case TaxIdType.eu_vat:
      return t(($) => $.signup.form.tax_id_examples.eu_vat, { prefix: vatPrefix(country) });
    case TaxIdType.de_stn:
      return t(($) => $.signup.form.tax_id_examples.de_stn);
    case TaxIdType.pl_nip:
      return t(($) => $.signup.form.tax_id_examples.pl_nip);
  }
}
