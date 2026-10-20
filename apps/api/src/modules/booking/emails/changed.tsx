import { BookingChange } from '@rampflow/shared/modules/booking/values';
import { Text } from '@react-email/components';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import type { EmailTemplateModule } from '../../../kernel/outbox.ts';
import { type BookingEmailPayload, BookingFacts, formatSlot } from '../lifecycle/email-parts.tsx';
import { example as confirmed } from './confirmed.tsx';

export interface BookingChangedPayload extends BookingEmailPayload {
  change: BookingChange;
  /** The slot before a reschedule. */
  previous: { startsAt: string; endsAt: string } | null;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'booking.changed': BookingChangedPayload;
  }
}

export const category = 'booking';

/** BK-03, AV-02: staff changed the slot or the avis. */
export const render: EmailTemplateModule<BookingChangedPayload>['render'] = (p, t) => ({
  subject: t('booking.email.changed.subject', { code: p.code }),
  body: (
    <EmailLayout
      lang={p.locale}
      preview={t('booking.email.changed.preview', { site: p.site.name })}
      footer={t('booking.email.footer')}
    >
      <Text>
        {p.change === BookingChange.rescheduled
          ? t('booking.email.changed.rescheduled', { site: p.site.name })
          : t('booking.email.changed.avis', { site: p.site.name })}
      </Text>
      {p.previous && (
        <Text style={{ color: '#71717a' }}>
          {t('booking.email.changed.previous')}:{' '}
          <s>{formatSlot(p.previous.startsAt, p.previous.endsAt, p.timeZone, p.locale)}</s>
        </Text>
      )}
      <BookingFacts p={p} t={t} />
    </EmailLayout>
  ),
});

export const example: BookingChangedPayload = {
  ...confirmed,
  change: BookingChange.rescheduled,
  previous: { startsAt: '2026-11-02T07:00:00.000Z', endsAt: '2026-11-02T08:00:00.000Z' },
};
