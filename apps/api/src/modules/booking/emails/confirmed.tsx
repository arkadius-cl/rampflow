import { Text } from '@react-email/components';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import type { EmailTemplate } from '../../../kernel/outbox.ts';
import { type BookingEmailPayload, BookingFacts, CodeQr } from '../lifecycle/email-parts.tsx';

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'booking.confirmed': BookingEmailPayload;
  }
}

export const category = 'booking';

/** BK-02, BK-04: code, QR code, address and slot in site time, to the booking contact. */
export const render: EmailTemplate<BookingEmailPayload>['render'] = (p, t) => ({
  subject: t('booking.email.confirmed.subject', { code: p.code, site: p.site.name }),
  body: (
    <EmailLayout
      lang={p.locale}
      preview={t('booking.email.confirmed.preview', { site: p.site.name })}
      footer={t('booking.email.footer')}
    >
      <Text>{t('booking.email.confirmed.intro', { site: p.site.name })}</Text>
      <BookingFacts p={p} t={t} />
      <CodeQr code={p.code} caption={t('booking.email.confirmed.qr')} />
    </EmailLayout>
  ),
});

export const example: BookingEmailPayload = {
  locale: 'de',
  bookingId: '00000000-0000-0000-0000-000000000000',
  code: 'K7M2Q9XA',
  site: {
    name: 'Lager Hamburg',
    addressLine1: 'Hafenstr. 1',
    addressLine2: null,
    postalCode: '20457',
    city: 'Hamburg',
    country: 'DE',
    phone: '+49 40 123456',
  },
  startsAt: '2026-11-02T08:00:00.000Z',
  endsAt: '2026-11-02T09:00:00.000Z',
  timeZone: 'Europe/Berlin',
  loadTypeName: { de: 'Palettiert', en: 'Palletised' },
  carrierName: 'Spedition Nowak',
};
