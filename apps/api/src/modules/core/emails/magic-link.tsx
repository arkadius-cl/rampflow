import { Button, Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { env } from '../../../kernel/env.ts';
import { deriveToken } from '../../../kernel/tokens.ts';

export interface MagicLinkPayload {
  authTokenId: string;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'core.magic-link': MagicLinkPayload;
  }
}

export const category = 'account';

export const example: MagicLinkPayload = { authTokenId: '01900000-0000-7000-8000-000000000000' };

const button = {
  backgroundColor: '#1d4ed8',
  borderRadius: '6px',
  color: '#ffffff',
  padding: '10px 18px',
};

/** CR-03: a single-use sign-in link, valid for 15 minutes. */
export function render(payload: MagicLinkPayload, t: TFunction) {
  const link = `${env.APP_ORIGIN}/auth/magic#${deriveToken('magic_link', payload.authTokenId)}`;
  return {
    subject: t('auth.email.magic_link.subject'),
    body: (
      <EmailLayout
        lang={(t as { lng?: string }).lng ?? 'en'}
        preview={t('auth.email.magic_link.preview')}
        footer={t('auth.email.footer')}
      >
        <Heading as="h1">{t('auth.email.magic_link.subject')}</Heading>
        <Text>{t('auth.email.magic_link.intro')}</Text>
        <Button href={link} style={button}>
          {t('auth.email.magic_link.action')}
        </Button>
        <Text>{t('auth.email.ignore')}</Text>
      </EmailLayout>
    ),
  };
}
