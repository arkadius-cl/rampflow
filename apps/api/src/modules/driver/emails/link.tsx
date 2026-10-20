import type { DriverLocale } from '@rampflow/shared';
import { Button, Text } from '@react-email/components';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import type { EmailTemplateModule } from '../../../kernel/outbox.ts';
import { addressLines, type EmailSite, formatSlot } from '../../booking/lifecycle/email-parts.tsx';
import { type DriverAccessId, driverLinkUrl } from '../access.ts';

export interface DriverLinkPayload {
  locale: DriverLocale;
  /** The link is derived from this row at send time; the outbox never holds it. */
  driverAccessId: string;
  code: string;
  site: EmailSite;
  startsAt: string;
  endsAt: string;
  timeZone: string;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'driver.link': DriverLinkPayload;
  }
}

export const category = 'booking';

/** CR-06: the driver link, in the language the sender chose for the driver. */
export const render: EmailTemplateModule<DriverLinkPayload>['render'] = (p, t) => ({
  subject: t('link-email.subject', { code: p.code, site: p.site.name }),
  body: (
    <EmailLayout
      lang={p.locale}
      preview={t('link-email.preview', { site: p.site.name })}
      footer={t('link-email.footer')}
    >
      <Text>{t('link-email.intro', { site: p.site.name })}</Text>
      <Text>
        {formatSlot(p.startsAt, p.endsAt, p.timeZone, p.locale)}
        <br />
        {[p.site.name, ...addressLines(p.site)].join(', ')}
      </Text>
      <Button
        href={driverLinkUrl(p.driverAccessId as DriverAccessId)}
        style={{ backgroundColor: '#18181b', color: '#ffffff', padding: '12px 20px' }}
      >
        {t('link-email.open')}
      </Button>
      <Text style={{ color: '#71717a', fontSize: '12px' }}>{t('link-email.personal')}</Text>
    </EmailLayout>
  ),
});

export const example: DriverLinkPayload = {
  locale: 'pl',
  driverAccessId: '00000000-0000-0000-0000-000000000000',
  code: 'K7M2Q9XA',
  site: {
    name: 'Lager Hamburg',
    addressLine1: 'Hafenstr. 1',
    addressLine2: null,
    postalCode: '20457',
    city: 'Hamburg',
    country: 'DE',
    phone: null,
  },
  startsAt: '2026-11-02T08:00:00.000Z',
  endsAt: '2026-11-02T09:00:00.000Z',
  timeZone: 'Europe/Berlin',
};
