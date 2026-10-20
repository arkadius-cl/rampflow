import { Text } from '@react-email/components';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import type { EmailTemplateModule } from '../../../kernel/outbox.ts';
import { type BookingEmailPayload, BookingFacts } from '../lifecycle/email-parts.tsx';
import { example as confirmed } from './confirmed.tsx';

export interface BookingCancelledPayload extends BookingEmailPayload {
  reason: string | null;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'booking.cancelled': BookingCancelledPayload;
  }
}

export const category = 'booking';

/** BK-03: staff cancelled the booking; the slot is free again. */
export const render: EmailTemplateModule<BookingCancelledPayload>['render'] = (p, t) => ({
  subject: t('booking.email.cancelled.subject', { code: p.code }),
  body: (
    <EmailLayout
      lang={p.locale}
      preview={t('booking.email.cancelled.preview', { site: p.site.name })}
      footer={t('booking.email.footer')}
    >
      <Text>{t('booking.email.cancelled.intro', { site: p.site.name })}</Text>
      {p.reason && (
        <Text>
          {t('booking.email.cancelled.reason')}: {p.reason}
        </Text>
      )}
      <BookingFacts p={p} t={t} />
    </EmailLayout>
  ),
});

export const example: BookingCancelledPayload = { ...confirmed, reason: 'Tor gesperrt' };
