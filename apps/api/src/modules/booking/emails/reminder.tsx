import { Text } from '@react-email/components';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import type { EmailTemplate } from '../../../kernel/outbox.ts';
import { type BookingEmailPayload, BookingFacts, CodeQr } from '../lifecycle/email-parts.tsx';
import { example as confirmed } from './confirmed.tsx';

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'booking.reminder': BookingEmailPayload;
  }
}

export const category = 'booking';

/** BK-07: `notify.reminder_hours_before` the start, to the booking contact. */
export const render: EmailTemplate<BookingEmailPayload>['render'] = (p, t) => ({
  subject: t('notify:email.reminder.subject', { code: p.code, site: p.site.name }),
  body: (
    <EmailLayout
      lang={p.locale}
      preview={t('notify:email.reminder.preview', { site: p.site.name })}
      footer={t('booking.email.footer')}
    >
      <Text>{t('notify:email.reminder.intro', { site: p.site.name })}</Text>
      <BookingFacts p={p} t={t} />
      <CodeQr code={p.code} caption={t('booking.email.confirmed.qr')} />
    </EmailLayout>
  ),
});

export const example: BookingEmailPayload = confirmed;
