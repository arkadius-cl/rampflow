import { randomUUID } from 'node:crypto';
import type { Entitlements, StaffLocale } from '@rampflow/shared';
import type {
  CarrierInvitationBody,
  CarrierInvitationView,
} from '@rampflow/shared/modules/booking/api.carriers';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { enqueueEmail } from '../../../kernel/outbox.ts';
import { tokenHashFor } from '../../../kernel/tokens.ts';
import { userDisplay } from '../../../kernel/users.ts';
import { org } from '../../core/schema.ts';
import { carrierInvitation } from '../schema.carriers.ts';

// TN-03, the tenant side: invite a carrier company by name and email, list and revoke pending
// invitations. Acceptance is in accept.redeem.ts.

export const CARRIER_INVITATION_MS = 7 * 24 * 60 * 60 * 1000;

type InvitationRow = typeof carrierInvitation.$inferSelect;

const view = (row: InvitationRow): CarrierInvitationView => ({
  id: row.id,
  companyName: row.companyName,
  email: row.email,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
});

const pendingOf = (tenantId: TenantId) =>
  and(
    eq(carrierInvitation.tenantId, tenantId),
    isNull(carrierInvitation.acceptedAt),
    isNull(carrierInvitation.revokedAt),
  );

/** Invitations neither accepted nor revoked, expired ones included, newest first. */
export async function listPendingInvitations(
  tx: Tx,
  tenantId: TenantId,
): Promise<CarrierInvitationView[]> {
  const rows = await tx
    .select()
    .from(carrierInvitation)
    .where(pendingOf(tenantId))
    .orderBy(desc(carrierInvitation.createdAt));
  return rows.map(view);
}

/**
 * Creates the invitation and enqueues its email. Inviting an email with a pending invitation
 * revokes that one, so "invite again" resends with a fresh 7-day link.
 */
export async function inviteCarrier(
  tx: Tx,
  o: {
    tenantId: TenantId;
    invitedBy: UserId;
    body: CarrierInvitationBody;
    entitlements: Entitlements;
    now: Date;
  },
): Promise<CarrierInvitationView> {
  const { tenantId, invitedBy, body, now } = o;
  await tx
    .update(carrierInvitation)
    .set({ revokedAt: now })
    .where(and(pendingOf(tenantId), eq(carrierInvitation.email, body.email)));
  const id = randomUUID();
  const [row] = await tx
    .insert(carrierInvitation)
    .values({
      id: id as InvitationRow['id'],
      tenantId,
      companyName: body.companyName,
      email: body.email,
      tokenHash: tokenHashFor('carrier_invitation', id),
      invitedBy,
      expiresAt: new Date(now.getTime() + CARRIER_INVITATION_MS),
    })
    .returning();
  if (!row) throw new Error('carrier invitation insert returned no row');

  const inviter = (await userDisplay(tx, [invitedBy])).get(invitedBy);
  const [tenant] = await tx.select({ name: org.name }).from(org).where(eq(org.id, tenantId));
  await enqueueEmail(
    tx,
    {
      template: 'booking.carrier-invitation',
      to: row.email,
      locale: body.locale ?? (inviter?.locale as StaffLocale | null) ?? 'en',
      tenantId,
      payload: {
        carrierInvitationId: row.id,
        tenantName: tenant?.name ?? '',
        companyName: row.companyName,
        inviterName: inviter?.name ?? null,
      },
    },
    o.entitlements,
  );
  return view(row);
}

/** Revokes a pending invitation; its link then answers 401. Answers alike when none matched. */
export async function revokeInvitation(
  tx: Tx,
  tenantId: TenantId,
  invitationId: string,
  now: Date,
): Promise<void> {
  await tx
    .update(carrierInvitation)
    .set({ revokedAt: now })
    .where(and(pendingOf(tenantId), eq(carrierInvitation.id, invitationId as InvitationRow['id'])));
}
