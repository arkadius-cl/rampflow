import { randomUUID } from 'node:crypto';
import type { Role } from '@rampflow/shared';
import type { InvitationView } from '@rampflow/shared/modules/core/api.staff';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import type { AnyOrgId, InvitationId, SiteId, TenantId, UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { enqueueEmail } from '../../../kernel/outbox.ts';
import { tokenHashFor } from '../../../kernel/tokens.ts';
import { userDisplay } from '../../../kernel/users.ts';
import { appUser, invitation, membership, type OrgKind } from '../schema.ts';

// Creating invitations for every org kind (PL-01, TN-01, CR-04). Acceptance is U2's
// `acceptInvitation` (core/invitations/accept.redeem.ts).

export const INVITATION_TTL_MS = 7 * 24 * 3600_000;

export type InvitationRow = typeof invitation.$inferSelect;

export interface NewInvitation {
  orgId: AnyOrgId;
  orgKind: OrgKind;
  orgName: string;
  email: string;
  role: Role;
  siteIds?: readonly SiteId[];
  invitedBy: UserId | null;
  /** A platform admin invites a tenant admin: the email names no inviting person. */
  fromPlatform?: boolean;
  /** The email's language: the org's default locale. */
  locale: string;
}

export function invitationView<R extends string>(row: InvitationRow, now: Date): InvitationView<R> {
  return {
    id: row.id,
    email: row.email,
    role: row.role as R,
    siteIds: row.siteIds,
    expiresAt: row.expiresAt.toISOString(),
    expired: row.expiresAt <= now,
  };
}

/** Pending: neither accepted nor revoked. Expired ones stay pending but no longer work. */
export const isPending = and(isNull(invitation.acceptedAt), isNull(invitation.revokedAt));

/** Pending invitations that still work at `now`, optionally without one email's. */
export const openInvitations = (orgId: AnyOrgId, now: Date, exceptEmail?: string) =>
  and(
    eq(invitation.orgId, orgId),
    isPending,
    gt(invitation.expiresAt, now),
    exceptEmail === undefined ? undefined : ne(invitation.email, exceptEmail),
  );

async function isMember(tx: Tx, orgId: AnyOrgId, email: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: membership.id })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(and(eq(membership.orgId, orgId), eq(appUser.email, email)));
  return row !== undefined;
}

/**
 * Creates an invitation and enqueues its email in the caller's transaction. Inviting an email
 * that already has a pending invitation to the org replaces it: the old link stops working and
 * a new one with a fresh 7-day expiry goes out. A member's email answers 409 `already_member`.
 */
export async function issueInvitation(
  tx: Tx,
  input: NewInvitation,
  now: Date,
): Promise<InvitationRow> {
  if (await isMember(tx, input.orgId, input.email)) {
    throw new ApiError('conflict', 'Already a member', { reason: 'already_member' });
  }
  await tx
    .update(invitation)
    .set({ revokedAt: now })
    .where(and(eq(invitation.orgId, input.orgId), eq(invitation.email, input.email), isPending));
  const id = randomUUID() as InvitationId;
  const [row] = await tx
    .insert(invitation)
    .values({
      id,
      orgId: input.orgId,
      orgKind: input.orgKind,
      email: input.email,
      role: input.role,
      siteIds: [...(input.siteIds ?? [])],
      tokenHash: tokenHashFor('invitation', id),
      invitedBy: input.invitedBy,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    })
    .returning();
  if (!row) throw new Error('invitation insert returned nothing');
  const inviter =
    input.invitedBy && !input.fromPlatform
      ? (await userDisplay(tx, [input.invitedBy])).get(input.invitedBy)
      : undefined;
  await enqueueEmail(
    tx,
    {
      template: 'core.invitation',
      to: input.email,
      locale: input.locale,
      payload: {
        invitationId: id,
        orgName: input.orgName,
        role: input.role,
        inviterName: inviter?.name ?? null,
      },
      // The outbox accepts only the scope's own tenant; the platform enqueues tenant-less.
      tenantId:
        input.orgKind === 'tenant' && !input.fromPlatform ? (input.orgId as TenantId) : null,
    },
    null,
  );
  return row;
}

/** Revokes a pending invitation of the org. Answers nothing either way (DELETE is idempotent). */
export async function revokeInvitation(
  tx: Tx,
  orgId: AnyOrgId,
  invitationId: InvitationId,
  now: Date,
): Promise<void> {
  await tx
    .update(invitation)
    .set({ revokedAt: now })
    .where(and(eq(invitation.id, invitationId), eq(invitation.orgId, orgId), isPending));
}
