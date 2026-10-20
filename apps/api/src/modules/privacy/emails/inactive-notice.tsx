import type { StaffLocale } from '@rampflow/shared';
import { Button, Text } from '@react-email/components';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { env } from '../../../kernel/env.ts';
import type { EmailTemplateModule } from '../../../kernel/outbox.ts';

export interface InactiveNoticePayload {
  locale: StaffLocale;
  /** The day the account goes unless its user signs in, `YYYY-MM-DD` in UTC. */
  deletesOn: string;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'privacy.inactive-notice': InactiveNoticePayload;
  }
}

export const category = 'account';

const button = {
  backgroundColor: '#1d4ed8',
  borderRadius: '6px',
  color: '#ffffff',
  padding: '10px 18px',
};

const DATE_TAG: Record<StaffLocale, string> = { de: 'de', en: 'en-GB', pl: 'pl' };

/** PL-05: 30 days before an inactive carrier account is deleted (data model, "Retention"). */
export const render: EmailTemplateModule<InactiveNoticePayload>['render'] = (p, t) => {
  const date = new Intl.DateTimeFormat(DATE_TAG[p.locale], {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${p.deletesOn}T12:00:00Z`));
  return {
    subject: t('privacy:email.inactive.subject'),
    body: (
      <EmailLayout
        lang={p.locale}
        preview={t('privacy:email.inactive.preview', { date })}
        footer={t('privacy:email.inactive.footer')}
      >
        <Text>{t('privacy:email.inactive.intro', { date })}</Text>
        <Text>{t('privacy:email.inactive.keep')}</Text>
        <Button href={`${env.APP_ORIGIN}/login`} style={button}>
          {t('privacy:email.inactive.sign_in')}
        </Button>
      </EmailLayout>
    ),
  };
};

export const example: InactiveNoticePayload = { locale: 'de', deletesOn: '2026-12-01' };
