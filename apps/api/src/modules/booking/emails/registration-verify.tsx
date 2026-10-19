import { Button, Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { env } from '../../../kernel/env.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import { button, languageOf } from './carrier-invitation.tsx';

/** Enqueued by `submitRegistration` (CR-02). */
export interface RegistrationVerifyPayload {
  registrationId: string;
  tenantName: string;
  siteName: string;
  /** The email has an account: the text asks to sign in instead of confirming the address. */
  knownAccount: boolean;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'booking.registration-verify': RegistrationVerifyPayload;
  }
}

export const category = 'account';

export const example: RegistrationVerifyPayload = {
  registrationId: '01900000-0000-7000-8000-000000000002',
  tenantName: 'Acme Logistics',
  siteName: 'Hamburg',
  knownAccount: false,
};

/** A single-use link to /carrier-registration#<token>, valid for 24 hours. */
export function render(payload: RegistrationVerifyPayload, t: TFunction) {
  const link = `${env.APP_ORIGIN}/carrier-registration#${deriveToken('registration', payload.registrationId)}`;
  const values = { tenant: payload.tenantName, site: payload.siteName };
  const variant = payload.knownAccount ? 'known' : 'verify';
  const subject = t(`registration.email.${variant}.subject`, values);
  return {
    subject,
    body: (
      <EmailLayout lang={languageOf(t)} preview={subject} footer={t('carriers.email.footer')}>
        <Heading as="h1">{subject}</Heading>
        <Text>{t(`registration.email.${variant}.intro`, values)}</Text>
        <Button href={link} style={button}>
          {t(`registration.email.${variant}.action`)}
        </Button>
        <Text>{t('registration.email.expiry')}</Text>
        <Text>{t('registration.email.ignore')}</Text>
      </EmailLayout>
    ),
  };
}
