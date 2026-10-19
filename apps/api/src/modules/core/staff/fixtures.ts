import { randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { OwnerDb } from '../../../../test/db.ts';
import type { MembershipId, UserId } from '../../../db/ids.ts';
import { deriveToken } from '../../../kernel/tokens.ts';
import { outboxMessage } from '../../notify/schema.ts';
import { invitation, membership } from '../schema.ts';

// Test fixtures of the platform, staff and carrier-user screens, read and written as the owner.

export async function membershipOf(db: OwnerDb, userId: UserId): Promise<MembershipId> {
  const [row] = await db
    .select({ id: membership.id })
    .from(membership)
    .where(eq(membership.userId, userId));
  if (!row) throw new Error(`no membership of ${userId}`);
  return row.id;
}

export const inviteeEmail = (label = 'invitee') =>
  `${label}-${randomBytes(4).toString('hex')}@invite.test`;

/** The error envelope of an answer. */
export async function errorOf(res: Response) {
  const body = (await res.json()) as {
    error: { code: string; message: string; details?: Record<string, unknown> };
  };
  return body.error;
}

/**
 * The newest invitation to `email`, the outbox row that announces it, and its token, derived
 * from the row id exactly as the email template does.
 */
export async function sentInvitation(db: OwnerDb, email: string) {
  const [row] = await db
    .select()
    .from(invitation)
    .where(eq(invitation.email, email))
    .orderBy(desc(invitation.createdAt))
    .limit(1);
  if (!row) throw new Error(`no invitation to ${email}`);
  const mails = await db
    .select()
    .from(outboxMessage)
    .where(and(eq(outboxMessage.toEmail, email), eq(outboxMessage.template, 'core.invitation')));
  const mail = mails.find((m) => (m.payload as { invitationId?: string }).invitationId === row.id);
  return { row, mail, token: deriveToken('invitation', row.id) };
}
