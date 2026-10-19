import type {
  CarrierInvitationAcceptBody,
  CarrierInvitationInspect,
} from '@rampflow/shared/modules/booking/api.carriers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { type CarrierId, hashToken, type UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { accountByEmail } from '../../core/auth/lookup.ts';
import { carrierInvitation } from '../schema.carriers.ts';
import { carrierOfUser, linkAsTenant, redeemingUser, tenantName } from './carrier-org.redeem.ts';

// TN-03 and CR-01, the carrier side: /carrier-invite#<token>. Runs under the token scope of the
// presented token; the claim is one guarded update (ADR-0002).

const pendingWhere = (token: string, now: Date) =>
  and(
    eq(carrierInvitation.tokenHash, hashToken(token)),
    isNull(carrierInvitation.acceptedAt),
    isNull(carrierInvitation.revokedAt),
    gt(carrierInvitation.expiresAt, now),
  );

const invalid = () => new ApiError('unauthorized', 'Invalid or expired invitation');

async function pending(tx: Tx, token: string, now: Date) {
  const [row] = await tx.select().from(carrierInvitation).where(pendingWhere(token, now));
  if (!row) throw invalid();
  return row;
}

/** What the page shows before acceptance: who invites, the company, and whether to sign in. */
export async function inspectCarrierInvitation(
  tx: Tx,
  token: string,
  now: Date,
): Promise<CarrierInvitationInspect> {
  const inv = await pending(tx, token, now);
  return {
    tenantName: await tenantName(tx, 'carrier_invitation', inv.tenantId),
    companyName: inv.companyName,
    email: inv.email,
    hasAccount: (await accountByEmail(tx, inv.email)) !== null,
  };
}

const missing = (path: 'name' | 'password') => ({
  path: [path],
  code: 'invalid_type',
  message: `${path} is required for a new account`,
});

/**
 * Accepts a carrier invitation (TN-03, CR-01). A new user sends name and password and becomes
 * carrier admin of a new company named by the invitation (or `companyName`). A user signed in
 * with the invited email links their existing carrier org instead; an email with an account
 * and no such session answers 401 `sign_in_required`. The link is active at once, also when the
 * tenant had deactivated it before sending this invitation; a later deactivation stays.
 * Single use, 7 days.
 */
export async function acceptCarrierInvitation(
  tx: Tx,
  input: CarrierInvitationAcceptBody & { signedIn: UserId | null },
  now: Date,
): Promise<{ userId: UserId; carrierId: CarrierId }> {
  const inv = await pending(tx, input.token, now);
  const userId = await redeemingUser(tx, {
    email: inv.email,
    signedIn: input.signedIn,
    now,
    newAccount: () => {
      const { name, password } = input;
      if (!name || !password) {
        const issues = [
          ...(name ? [] : [missing('name')]),
          ...(password ? [] : [missing('password')]),
        ];
        throw new ApiError('validation_failed', 'Name and password are required', { issues });
      }
      return { name, password, locale: input.locale ?? null };
    },
  });
  const carrierId = await carrierOfUser(tx, userId, {
    name: input.companyName ?? inv.companyName,
    country: null,
  });

  const [claimed] = await tx
    .update(carrierInvitation)
    .set({ acceptedAt: now, acceptedCarrierId: carrierId })
    .where(pendingWhere(input.token, now))
    .returning({ tenantId: carrierInvitation.tenantId, sentAt: carrierInvitation.createdAt });
  if (!claimed) throw invalid();

  await linkAsTenant(tx, 'carrier_invitation', {
    tenantId: claimed.tenantId,
    carrierId,
    source: 'invitation',
    reactivateDeactivatedBefore: claimed.sentAt,
  });
  return { userId, carrierId };
}
