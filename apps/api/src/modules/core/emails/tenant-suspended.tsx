import { Salutation } from '@rampflow/shared/modules/core/values';
import { EmailCategory } from '@rampflow/shared/values';
import { Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { type GreetingNames, greeting } from './greeting.ts';

/**
 * Enqueued by `suspendTenant` for every tenant admin whose account is not disabled (PL-07).
 * Carries the org name and the reason the platform admin wrote for the tenant, nothing else.
 */
export interface TenantSuspendedPayload {
  orgName: string;
  reason: string;
  /** The admin's name parts; a user without them (PL-01 invitees) gets the display name. */
  recipient: GreetingNames;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'core.tenant-suspended': TenantSuspendedPayload;
  }
}

export const category = EmailCategory.account;

export const example: TenantSuspendedPayload = {
  orgName: 'Acme Logistics',
  reason: 'Several carriers reported bookings nobody delivered.',
  recipient: { salutation: Salutation.ms, givenName: 'Anna', familyName: 'Lenz' },
};

export function render(payload: TenantSuspendedPayload, t: TFunction) {
  const values = { org: payload.orgName, reason: payload.reason };
  const subject = t('auth.email.tenant_suspended.subject', values);
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
        <Text>{t('auth.email.tenant_suspended.intro', values)}</Text>
        <Text>{t('auth.email.tenant_suspended.reason', values)}</Text>
        <Text>{t('auth.email.tenant_suspended.effect')}</Text>
      </EmailLayout>
    ),
  };
}
