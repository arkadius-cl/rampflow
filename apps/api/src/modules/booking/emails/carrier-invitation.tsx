import { Button, Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { env } from '../../../kernel/env.ts';
import { deriveToken } from '../../../kernel/tokens.ts';

/** Enqueued by `inviteCarrier` (TN-03). */
export interface CarrierInvitationPayload {
  carrierInvitationId: string;
  tenantName: string;
  companyName: string;
  inviterName: string | null;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'booking.carrier-invitation': CarrierInvitationPayload;
  }
}

export const category = 'account';

export const example: CarrierInvitationPayload = {
  carrierInvitationId: '01900000-0000-7000-8000-000000000001',
  tenantName: 'Acme Logistics',
  companyName: 'Trans-Pol Sp. z o.o.',
  inviterName: 'Anna Lenz',
};

/** The call-to-action of every carrier network email. */
export const button = {
  backgroundColor: '#1d4ed8',
  borderRadius: '6px',
  color: '#ffffff',
  padding: '10px 18px',
};

export const languageOf = (t: TFunction) => (t as { lng?: string }).lng ?? 'en';

/** A single-use link to /carrier-invite#<token>, valid for 7 days. */
export function render(payload: CarrierInvitationPayload, t: TFunction) {
  const link = `${env.APP_ORIGIN}/carrier-invite#${deriveToken('carrier_invitation', payload.carrierInvitationId)}`;
  const values = {
    tenant: payload.tenantName,
    company: payload.companyName,
    inviter: payload.inviterName,
  };
  const subject = t('carriers.email.invitation.subject', values);
  return {
    subject,
    body: (
      <EmailLayout lang={languageOf(t)} preview={subject} footer={t('carriers.email.footer')}>
        <Heading as="h1">{subject}</Heading>
        <Text>
          {payload.inviterName
            ? t('carriers.email.invitation.intro_by', values)
            : t('carriers.email.invitation.intro', values)}
        </Text>
        <Text>{t('carriers.email.invitation.free')}</Text>
        <Button href={link} style={button}>
          {t('carriers.email.invitation.action')}
        </Button>
        <Text>{t('carriers.email.invitation.expiry')}</Text>
      </EmailLayout>
    ),
  };
}
