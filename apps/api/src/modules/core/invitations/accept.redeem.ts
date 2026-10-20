import { randomUUID } from 'node:crypto';
import type { Role } from '@rampflow/shared';
import type {
  InvitationAcceptBody,
  InvitationInspectResponse,
} from '@rampflow/shared/modules/core/api.auth';
import {
  ConflictReason,
  ErrorCode,
  OrgKind,
  ScopeParty,
  SystemActorName,
  UnauthorizedReason,
  ZodIssueCode,
} from '@rampflow/shared/values';
import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  type AnyOrgId,
  type CarrierId,
  hashToken,
  type MembershipId,
  type SiteId,
  type TenantId,
  type UserId,
} from '../../../db/ids.ts';
import { asScope, type CarrierRole, type Scope, type Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { systemActor } from '../../../kernel/system.ts';
import { accountByEmail } from '../auth/lookup.ts';
import { hashPassword } from '../auth/password.ts';
import { appUser, invitation, membership, membershipSite, org } from '../schema.ts';

// Staff, tenant admin, platform admin and carrier user invitations (PL-01, TN-01, CR-01, CR-04).
// Every function runs in a transaction under the token scope of the presented token (ADR-0002,
// "Token redemption is one transaction"): it claims the invitation with one guarded statement and
// switches with asScope to write the membership as the invited org.

type PendingInvitation = typeof invitation.$inferSelect;

const pendingWhere = (token: string, now: Date) =>
  and(
    eq(invitation.tokenHash, hashToken(token)),
    isNull(invitation.acceptedAt),
    isNull(invitation.revokedAt),
    gt(invitation.expiresAt, now),
  );

async function pending(tx: Tx, token: string, now: Date): Promise<PendingInvitation> {
  const [row] = await tx.select().from(invitation).where(pendingWhere(token, now));
  if (!row) throw new ApiError(ErrorCode.unauthorized, 'Invalid or expired invitation');
  return row;
}

/**
 * The scope that writes as the invited org. Tenant memberships are written by the system actor
 * `invitation`; carrier and platform memberships by the joining user, who acts for that org.
 */
function orgScope(orgKind: OrgKind, orgId: AnyOrgId, userId: UserId, role: Role): Scope {
  switch (orgKind) {
    case OrgKind.tenant:
      return {
        party: ScopeParty.tenant,
        tenantId: orgId as TenantId,
        siteIds: 'all',
        actor: systemActor(SystemActorName.invitation),
      };
    case OrgKind.carrier:
      return {
        party: ScopeParty.carrier,
        carrierId: orgId as CarrierId,
        userId,
        role: role as CarrierRole,
      };
    case OrgKind.platform:
      return { party: ScopeParty.platform, userId };
  }
}

/** What the invitation page shows before acceptance: the org, the role, and whether to sign in. */
export async function inspectInvitation(
  tx: Tx,
  token: string,
  now: Date,
): Promise<InvitationInspectResponse> {
  const inv = await pending(tx, token, now);
  // Carrier and platform invitations come from an admin of that org (CR-04); the org name is
  // read as the inviter. Tenant names are read by the system actor.
  const reader = inv.invitedBy;
  if (inv.orgKind !== OrgKind.tenant && !reader)
    throw new Error(`Invitation ${inv.id} has no inviter`);
  const [named] = await asScope(
    tx,
    orgScope(inv.orgKind, inv.orgId, reader as UserId, inv.role as Role),
    (inner) => inner.select({ name: org.name }).from(org).where(eq(org.id, inv.orgId)),
  );
  return {
    orgKind: inv.orgKind,
    orgName: named?.name ?? '',
    role: inv.role as Role,
    email: inv.email,
    hasAccount: (await accountByEmail(tx, inv.email)) !== null,
  };
}

export interface AcceptedInvitation {
  userId: UserId;
  orgId: AnyOrgId;
  orgKind: OrgKind;
  role: Role;
  membershipId: MembershipId;
}

/** The signed-in user, when their email is the invited one. */
async function signedInAs(tx: Tx, userId: UserId | null, email: string): Promise<UserId | null> {
  if (!userId) return null;
  const [me] = await tx
    .select({ email: appUser.email })
    .from(appUser)
    .where(eq(appUser.id, userId));
  return me && me.email.toLowerCase() === email.toLowerCase() ? userId : null;
}

/** The request fields a new account needs; a zod issue names them as its path. */
const missing = (path: keyof Pick<InvitationAcceptBody, 'name' | 'password'>) => ({
  path: [path],
  code: ZodIssueCode.invalid_type,
  message: `${path} is required for a new account`,
});

/** Creates the invited user with a verified email. `null` when the email has an account by now. */
async function createAccount(
  tx: Tx,
  inv: PendingInvitation,
  input: Pick<InvitationAcceptBody, 'name' | 'password' | 'locale'>,
  now: Date,
): Promise<UserId | null> {
  const { name, password } = input;
  if (!name || !password) {
    const issues = [...(name ? [] : [missing('name')]), ...(password ? [] : [missing('password')])];
    throw new ApiError(ErrorCode.validation_failed, 'Name and password are required', { issues });
  }
  const id = randomUUID() as UserId;
  // The token party may insert users but reads back only its own, so the id is ours and a
  // concurrent acceptance of the same email loses the unique index quietly instead of failing.
  const inserted = await tx
    .insert(appUser)
    .values({
      id,
      email: inv.email,
      name,
      locale: input.locale ?? null,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: now,
    })
    .onConflictDoNothing();
  return inserted.rowCount === 1 ? id : null;
}

/**
 * Accepts the invitation of `token` (PL-01, TN-01, CR-01, CR-04).
 *
 * - A user signed in with the invited email just joins.
 * - Without such a session, an email that already has an account answers 401 with reason
 *   `sign_in_required`; the page signs in first.
 * - Otherwise a new user is created from `name` and `password`; missing fields answer 422.
 *
 * Gate and dock site lists become `membership_site` rows. A second acceptance, an expired or a
 * revoked invitation answers 401; an existing membership in the org answers 409 `already_member`.
 * `tx` must run under `tokenScope(token, signedIn)`.
 */
export async function acceptInvitation(
  tx: Tx,
  input: InvitationAcceptBody & { signedIn: UserId | null },
  now: Date,
): Promise<AcceptedInvitation> {
  const inv = await pending(tx, input.token, now);
  let userId = await signedInAs(tx, input.signedIn, inv.email);
  if (!userId) {
    if (await accountByEmail(tx, inv.email)) {
      throw new ApiError(ErrorCode.unauthorized, 'Sign in to accept', {
        reason: UnauthorizedReason.sign_in_required,
      });
    }
    userId = await createAccount(tx, inv, input, now);
    if (!userId) {
      throw new ApiError(ErrorCode.unauthorized, 'Sign in to accept', {
        reason: UnauthorizedReason.sign_in_required,
      });
    }
  }

  const [claimed] = await tx
    .update(invitation)
    .set({ acceptedAt: now, acceptedUserId: userId })
    .where(pendingWhere(input.token, now))
    .returning({
      orgId: invitation.orgId,
      orgKind: invitation.orgKind,
      role: invitation.role,
      siteIds: invitation.siteIds,
      invitedBy: invitation.invitedBy,
    });
  if (!claimed) throw new ApiError(ErrorCode.unauthorized, 'Invalid or expired invitation');

  const role = claimed.role as Role;
  const joined = userId;
  const membershipId = await asScope(
    tx,
    orgScope(claimed.orgKind, claimed.orgId, joined, role),
    async (inner) => {
      const id = randomUUID() as MembershipId;
      const created = await inner
        .insert(membership)
        .values({
          id,
          userId: joined,
          orgId: claimed.orgId,
          orgKind: claimed.orgKind,
          role,
          createdBy: claimed.invitedBy,
        })
        .onConflictDoNothing();
      if (created.rowCount !== 1) {
        throw new ApiError(ErrorCode.conflict, 'Already a member', {
          reason: ConflictReason.already_member,
        });
      }
      if (claimed.orgKind === OrgKind.tenant && claimed.siteIds.length > 0) {
        await inner.insert(membershipSite).values(
          claimed.siteIds.map((siteId) => ({
            membershipId: id,
            userId: joined,
            siteId: siteId as SiteId,
            tenantId: claimed.orgId as TenantId,
          })),
        );
      }
      return id;
    },
  );
  return { userId: joined, orgId: claimed.orgId, orgKind: claimed.orgKind, role, membershipId };
}
