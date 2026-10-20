import { TokenPurpose } from '@rampflow/shared/values';
import { Button, Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { env } from '../../../kernel/env.ts';
import { deriveToken } from '../../../kernel/tokens.ts';

export interface PasswordResetPayload {
  authTokenId: string;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'core.password-reset': PasswordResetPayload;
  }
}

export const category = 'account';

export const example: PasswordResetPayload = {
  authTokenId: '01900000-0000-7000-8000-000000000000',
};

const button = {
  backgroundColor: '#1d4ed8',
  borderRadius: '6px',
  color: '#ffffff',
  padding: '10px 18px',
};

/** CR-03: a single-use link to set a new password, valid for 60 minutes. */
export function render(payload: PasswordResetPayload, t: TFunction) {
  const link = `${env.APP_ORIGIN}/auth/reset#${deriveToken(TokenPurpose.password_reset, payload.authTokenId)}`;
  return {
    subject: t('auth.email.password_reset.subject'),
    body: (
      <EmailLayout
        lang={(t as { lng?: string }).lng ?? 'en'}
        preview={t('auth.email.password_reset.preview')}
        footer={t('auth.email.footer')}
      >
        <Heading as="h1">{t('auth.email.password_reset.subject')}</Heading>
        <Text>{t('auth.email.password_reset.intro')}</Text>
        <Button href={link} style={button}>
          {t('auth.email.password_reset.action')}
        </Button>
        <Text>{t('auth.email.ignore')}</Text>
      </EmailLayout>
    ),
  };
}
