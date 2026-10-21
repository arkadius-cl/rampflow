import type { Salutation } from '@rampflow/shared/modules/core/values';
import { EmailCategory, TokenPurpose } from '@rampflow/shared/values';
import { Button, Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { env } from '../../../kernel/env.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import { greeting } from './greeting.ts';

/** Enqueued by `submitSignup` for an email without an account (RG-01). */
export interface SignupVerifyPayload {
  signupId: string;
  companyName: string;
  salutation: Salutation | null;
  givenName: string;
  familyName: string;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'core.signup-verify': SignupVerifyPayload;
  }
}

export const category = EmailCategory.account;

export const example: SignupVerifyPayload = {
  signupId: '01900000-0000-7000-8000-000000000010',
  companyName: 'Nordhafen Kühllogistik GmbH',
  salutation: null,
  givenName: 'Jonas',
  familyName: 'Petersen',
};

const button = {
  backgroundColor: '#1d4ed8',
  borderRadius: '6px',
  color: '#ffffff',
  padding: '10px 18px',
};

/** A single-use link to /signup/verify#<token>, valid for 24 hours. */
export function render(payload: SignupVerifyPayload, t: TFunction) {
  const link = `${env.APP_ORIGIN}/signup/verify#${deriveToken(TokenPurpose.signup, payload.signupId)}`;
  const values = { company: payload.companyName };
  const subject = t('signup.email.verify.subject', values);
  return {
    subject,
    body: (
      <EmailLayout
        lang={(t as { lng?: string }).lng ?? 'en'}
        preview={t('signup.email.verify.preview')}
        footer={t('auth.email.footer')}
      >
        <Text>{greeting(t, payload)}</Text>
        <Heading as="h1">{subject}</Heading>
        <Text>{t('signup.email.verify.intro', values)}</Text>
        <Button href={link} style={button}>
          {t('signup.email.verify.action')}
        </Button>
        <Text>{t('signup.email.verify.expiry')}</Text>
        <Text>{t('signup.email.verify.ignore')}</Text>
      </EmailLayout>
    ),
  };
}
