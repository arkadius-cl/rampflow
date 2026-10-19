import { Button, Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { env } from '../../../kernel/env.ts';
import { button, languageOf } from './carrier-invitation.tsx';

/** Enqueued when a tenant approves a registration (TN-04). */
export interface RegistrationApprovedPayload {
  registrationId: string;
  carrierId: string;
  tenantName: string;
  siteName: string;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'booking.registration-approved': RegistrationApprovedPayload;
  }
}

export const category = 'account';

export const example: RegistrationApprovedPayload = {
  registrationId: '01900000-0000-7000-8000-000000000003',
  carrierId: '01900000-0000-7000-8000-000000000004',
  tenantName: 'Acme Logistics',
  siteName: 'Hamburg',
};

/** Links to the carrier's booking wizard; sign-in comes first when needed. */
export function render(payload: RegistrationApprovedPayload, t: TFunction) {
  const link = `${env.APP_ORIGIN}/c/${payload.carrierId}/book`;
  const values = { tenant: payload.tenantName, site: payload.siteName };
  const subject = t('registration.email.approved.subject', values);
  return {
    subject,
    body: (
      <EmailLayout lang={languageOf(t)} preview={subject} footer={t('carriers.email.footer')}>
        <Heading as="h1">{subject}</Heading>
        <Text>{t('registration.email.approved.intro', values)}</Text>
        <Button href={link} style={button}>
          {t('registration.email.approved.action')}
        </Button>
      </EmailLayout>
    ),
  };
}
