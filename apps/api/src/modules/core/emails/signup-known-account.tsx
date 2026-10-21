import { EmailCategory, StaffLocale } from '@rampflow/shared/values';
import { Button, Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { env } from '../../../kernel/env.ts';

/**
 * Enqueued by `submitSignup` instead of the verification email when the address has an account
 * (RG-03). It repeats none of the form data.
 */
export interface SignupKnownAccountPayload {
  locale: StaffLocale;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'core.signup-known-account': SignupKnownAccountPayload;
  }
}

export const category = EmailCategory.account;

export const example: SignupKnownAccountPayload = { locale: StaffLocale.de };

const button = {
  backgroundColor: '#1d4ed8',
  borderRadius: '6px',
  color: '#ffffff',
  padding: '10px 18px',
};

export function render(_payload: SignupKnownAccountPayload, t: TFunction) {
  const subject = t('signup.email.known_account.subject');
  return {
    subject,
    body: (
      <EmailLayout
        lang={(t as { lng?: string }).lng ?? 'en'}
        preview={t('signup.email.known_account.preview')}
        footer={t('auth.email.footer')}
      >
        <Heading as="h1">{subject}</Heading>
        <Text>{t('signup.email.known_account.intro')}</Text>
        <Button href={`${env.APP_ORIGIN}/login`} style={button}>
          {t('signup.email.known_account.action')}
        </Button>
        <Text>{t('signup.email.known_account.reset')}</Text>
        <Text>{t('signup.email.known_account.ignore')}</Text>
      </EmailLayout>
    ),
  };
}
