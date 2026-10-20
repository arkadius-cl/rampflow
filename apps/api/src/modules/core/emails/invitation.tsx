import { Role, TokenPurpose } from '@rampflow/shared/values';
import { Button, Heading, Text } from '@react-email/components';
import type { TFunction } from 'i18next';
import { EmailLayout } from '../../../kernel/email-layout.tsx';
import { env } from '../../../kernel/env.ts';
import { deriveToken } from '../../../kernel/tokens.ts';

/** Enqueued by whoever creates an `invitation` row (U3: PL-01, TN-01, CR-04). */
export interface InvitationPayload {
  invitationId: string;
  orgName: string;
  role: Role;
  /** The inviting person's name; `null` when the platform invites. */
  inviterName: string | null;
}

declare module '../../../kernel/outbox.ts' {
  interface EmailTemplates {
    'core.invitation': InvitationPayload;
  }
}

export const category = 'account';

export const example: InvitationPayload = {
  invitationId: '01900000-0000-7000-8000-000000000000',
  orgName: 'Acme Logistics',
  role: Role.dispatcher,
  inviterName: 'Anna Lenz',
};

const button = {
  backgroundColor: '#1d4ed8',
  borderRadius: '6px',
  color: '#ffffff',
  padding: '10px 18px',
};

/** A single-use link to /invite#<token>, valid for 7 days. */
export function render(payload: InvitationPayload, t: TFunction) {
  const link = `${env.APP_ORIGIN}/invite#${deriveToken(TokenPurpose.invitation, payload.invitationId)}`;
  const values = {
    org: payload.orgName,
    role: t(`shell.roles.${payload.role}`),
    inviter: payload.inviterName,
  };
  const subject = t('auth.email.invitation.subject', values);
  return {
    subject,
    body: (
      <EmailLayout
        lang={(t as { lng?: string }).lng ?? 'en'}
        preview={subject}
        footer={t('auth.email.footer')}
      >
        <Heading as="h1">{subject}</Heading>
        <Text>
          {payload.inviterName
            ? t('auth.email.invitation.intro_by', values)
            : t('auth.email.invitation.intro', values)}
        </Text>
        <Button href={link} style={button}>
          {t('auth.email.invitation.action')}
        </Button>
        <Text>{t('auth.email.invitation.expiry')}</Text>
      </EmailLayout>
    ),
  };
}
