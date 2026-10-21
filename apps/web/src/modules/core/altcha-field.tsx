import 'altcha';
import type { SignupBody, SignupForm } from '@rampflow/shared/modules/core/api.signup';
import type { AltchaWidgetElement } from 'altcha/types/generic';
import type {} from 'altcha/types/react';
import { useEffect, useRef } from 'react';
import { type Control, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useFieldMessage } from '@/components/app-shell/form-errors';
import { FieldError } from '@/components/ui/field';
import { useLocale } from '@/lib/i18n';

// RG-01, design decision 6: the ALTCHA proof of work. The widget fetches its challenge from our
// API, solves it in a worker when the form is submitted, then submits the form again with the
// payload in this field. No cookie, no third-party request.

const CHALLENGE_URL = '/api/public/signups/challenge';
/** Without the footer link to altcha.org and the logo: the page names the check itself. */
const CONFIGURATION = JSON.stringify({ hideFooter: true, hideLogo: true });

interface StateChange {
  payload?: string;
}

/**
 * The `altcha` field of the registration form. Remount it (a new `key`) after every server
 * answer: the API accepts a solution once, so the next submit needs a fresh challenge.
 */
export function AltchaField({ control }: { control: Control<SignupForm, unknown, SignupBody> }) {
  const message = useFieldMessage();
  return (
    <Controller
      name="altcha"
      control={control}
      render={({ field, fieldState }) => (
        <div>
          <AltchaWidget onPayload={field.onChange} />
          <FieldError>{message(fieldState.error)}</FieldError>
        </div>
      )}
    />
  );
}

function AltchaWidget({ onPayload }: { onPayload: (payload: string) => void }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const ref = useRef<AltchaWidgetElement>(null);

  useEffect(() => {
    const strings = globalThis.$altcha.i18n.get('en');
    globalThis.$altcha.i18n.set(locale, {
      ...strings,
      label: t(($) => $.signup.altcha.label),
      loading: t(($) => $.signup.altcha.loading),
      verifying: t(($) => $.signup.altcha.verifying),
      verified: t(($) => $.signup.altcha.verified),
      error: t(($) => $.signup.altcha.error),
      expired: t(($) => $.signup.altcha.expired),
      verificationRequired: t(($) => $.signup.altcha.verification_required),
      waitAlert: t(($) => $.signup.altcha.wait),
      reload: t(($) => $.signup.altcha.reload),
      verify: t(($) => $.signup.altcha.verify),
    });
  }, [locale, t]);

  useEffect(() => {
    const widget = ref.current;
    if (!widget) return;
    const onChange = (event: Event) => {
      const { payload } = (event as CustomEvent<StateChange>).detail;
      onPayload(payload ?? '');
    };
    widget.addEventListener('statechange', onChange);
    return () => widget.removeEventListener('statechange', onChange);
  }, [onPayload]);

  return (
    <altcha-widget
      ref={ref}
      challenge={CHALLENGE_URL}
      auto="onsubmit"
      configuration={CONFIGURATION}
      language={locale}
    />
  );
}
