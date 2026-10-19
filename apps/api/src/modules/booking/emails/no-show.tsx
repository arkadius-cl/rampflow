import { formatSiteTime, type TimeZone } from '@rampflow/shared/time';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import type { EmailTemplate } from '../../../kernel/outbox.ts';
import { type BookingEmailPayload, BookingFacts } from '../lifecycle/email-parts.tsx';
import { example as confirmed } from './confirmed.tsx';

export interface BookingNoShowPayload extends BookingEmailPayload {
  /** `starts_at + yard.no_show_after_minutes`, the instant stamped as `no_show_at`. */
  dueAt: string;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'booking.no-show': BookingNoShowPayload;
  }
}

export const category = 'booking';

/** BK-08: no check-in by the deadline; the booking is closed and its capacity free. */
export const render: EmailTemplate<BookingNoShowPayload>['render'] = (p, t) => {
  const deadline = formatSiteTime(new Date(p.dueAt), p.timeZone as TimeZone, p.locale);
  return {
    subject: t('notify:email.no_show.subject', { code: p.code }),
    body: (
      <EmailLayout
        lang={p.locale}
        preview={t('notify:email.no_show.preview', { site: p.site.name })}
        footer={t('booking.email.footer')}
      >
        <Text>{t('notify:email.no_show.intro', { site: p.site.name, deadline })}</Text>
        <Text>{t('notify:email.no_show.next')}</Text>
        <BookingFacts p={p} t={t} />
      </EmailLayout>
    ),
  };
};

export const example: BookingNoShowPayload = { ...confirmed, dueAt: '2026-11-02T09:00:00.000Z' };
