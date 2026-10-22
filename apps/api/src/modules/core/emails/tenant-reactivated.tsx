import { Salutation } from '@rampflow/shared/modules/core/values';
import { EmailCategory } from '@rampflow/shared/values';
import { Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { type GreetingNames, greeting } from './greeting.ts';

/** Enqueued by `reactivateTenant` for every tenant admin whose account is not disabled (PL-07). */
export interface TenantReactivatedPayload {
  orgName: string;
  recipient: GreetingNames;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'core.tenant-reactivated': TenantReactivatedPayload;
  }
}

export const category = EmailCategory.account;

export const example: TenantReactivatedPayload = {
  orgName: 'Acme Logistics',
  recipient: { salutation: Salutation.ms, givenName: 'Anna', familyName: 'Lenz' },
};

export function render(payload: TenantReactivatedPayload, t: TFunction) {
  const values = { org: payload.orgName };
  const subject = t('auth.email.tenant_reactivated.subject', values);
  return {
    subject,
    body: (
      <EmailLayout
        lang={(t as { lng?: string }).lng ?? 'en'}
        preview={subject}
        footer={t('auth.email.footer')}
      >
        <Heading as="h1">{subject}</Heading>
        <Text>{greeting(t, payload.recipient)}</Text>
        <Text>{t('auth.email.tenant_reactivated.intro', values)}</Text>
      </EmailLayout>
    ),
  };
}
