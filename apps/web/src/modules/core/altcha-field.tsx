import 'altcha';
import type { SignupBody, SignupForm } from '@rampflow/shared/modules/core/api.signup';
import { AltchaState } from '@rampflow/shared/modules/core/values';
import type { State } from 'altcha/types';
import type { AltchaWidgetElement } from 'altcha/types/generic';
import type {} from 'altcha/types/react';
import { useEffect, useRef } from 'react';
import { type Control, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { useFieldMessage } from '@/components/app-shell/form-errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FieldError } from '@/components/ui/field';
import { useLocale } from '@/lib/i18n';

// RG-01, design decision 6: the ALTCHA proof of work. The widget fetches its challenge from our
// API, solves it in a worker when the form is submitted, then submits the form again with the
// payload in this field. No cookie, no third-party request.

const CHALLENGE_URL = '/api/public/signups/challenge';
/** Without the footer link to altcha.org and the logo: the page names the check itself. */
const CONFIGURATION = JSON.stringify({ hideFooter: true, hideLogo: true });

const ExpiringPayload = z.object({
  challenge: z.object({
    parameters: z.object({ data: z.object({ expiresAt: z.number().finite() }) }),
  }),
});

interface StateChange {
  payload?: string;
  state: State;
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
        <div className="[&_.altcha-checkbox_svg]:pointer-events-none">
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
    const form = widget.closest('form');
    let expiration: ReturnType<typeof setTimeout> | undefined;
    const onChange = (event: Event) => {
      clearTimeout(expiration);
      const { payload, state } = (event as CustomEvent<StateChange>).detail;
      onPayload(state === AltchaState.verified ? (payload ?? '') : '');
      if (state !== AltchaState.verified || !payload) return;
      // The widget only understands parameters.expiresAt; our API signs data.expiresAt.
      const parsed = ExpiringPayload.parse(JSON.parse(atob(payload)));
      expiration = setTimeout(
        () => widget.reset(AltchaState.expired as State),
        Math.max(0, parsed.challenge.parameters.data.expiresAt * 1000 - Date.now()),
      );
    };
    widget.addEventListener('statechange', onChange);
    const onSubmit = (event: SubmitEvent) => {
      const state = widget.getState();
      if (state === AltchaState.error || state === AltchaState.expired) {
        // ALTCHA auto=onsubmit only starts a solve from UNVERIFIED, not ERROR or EXPIRED.
        event.preventDefault();
        event.stopImmediatePropagation();
        void widget.verify().then((result) => {
          if (!result?.payload) return;
          // ALTCHA dispatches statechange after its verify promise resolves.
          onPayload(result.payload);
          form?.requestSubmit(event.submitter ?? undefined);
        });
      } else if (state === AltchaState.verifying) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    form?.addEventListener('submit', onSubmit, { capture: true });
    return () => {
      clearTimeout(expiration);
      widget.removeEventListener('statechange', onChange);
      form?.removeEventListener('submit', onSubmit, { capture: true });
    };
  }, [onPayload]);

  if (!globalThis.isSecureContext) {
    const local = new URL('/signup', location.href);
    local.hostname = 'localhost';
    return (
      <Alert>
        <AlertTitle>{t(($) => $.signup.altcha.secure_title)}</AlertTitle>
        <AlertDescription>
          <p>{t(($) => $.signup.altcha.secure_required)}</p>
          {import.meta.env.DEV ? (
            <>
              <p>{t(($) => $.signup.altcha.dev_hint)}</p>
              <a href={local.href}>{t(($) => $.signup.altcha.open_localhost)}</a>
            </>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

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
