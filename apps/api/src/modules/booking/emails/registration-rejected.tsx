import { Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { languageOf } from './carrier-invitation.tsx';

/** Enqueued when a tenant rejects a registration (TN-04). */
export interface RegistrationRejectedPayload {
  registrationId: string;
  tenantName: string;
  siteName: string;
  reason: string;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'booking.registration-rejected': RegistrationRejectedPayload;
  }
}

export const category = 'account';

export const example: RegistrationRejectedPayload = {
  registrationId: '01900000-0000-7000-8000-000000000005',
  tenantName: 'Acme Logistics',
  siteName: 'Hamburg',
  reason: 'We only work with carriers that hold ADR approval.',
};

export function render(payload: RegistrationRejectedPayload, t: TFunction) {
  const values = { tenant: payload.tenantName, site: payload.siteName };
  const subject = t('registration.email.rejected.subject', values);
  return {
    subject,
    body: (
      <EmailLayout lang={languageOf(t)} preview={subject} footer={t('carriers.email.footer')}>
        <Heading as="h1">{subject}</Heading>
        <Text>{t('registration.email.rejected.intro', values)}</Text>
        <Text>{t('registration.email.rejected.reason', { reason: payload.reason })}</Text>
      </EmailLayout>
    ),
  };
}
