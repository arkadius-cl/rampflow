import type { RegistrationVerified } from '@rampflow/shared/modules/booking/api.carriers';
import { and, eq, gt } from 'drizzle-orm';
import { hashToken, type UserId } from '../../../db/ids.ts';
import { asScope, type Tx } from '../../../db/scope.ts';
import { loadAccess } from '../../../kernel/access.ts';
import type { Clock } from '../../../kernel/clock.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { carrierOfUser, linkAsTenant, redeemingUser } from '../carriers/carrier-org.redeem.ts';
import { carrierRegistration } from '../schema.carriers.ts';
import { publicScope } from './public-links.ts';

// CR-02: /carrier-registration#<token>. Verifies the email, signs the carrier in, and applies
// `booking.public_registration_mode` of the registration's site. Runs under the token scope of
// the presented token; the claim is one guarded update (ADR-0002).

const pendingWhere = (token: string, now: Date) =>
  and(
    eq(carrierRegistration.tokenHash, hashToken(token)),
    eq(carrierRegistration.status, 'pending_email'),
    gt(carrierRegistration.expiresAt, now),
  );

/**
 * A new email gets a verified account without password (it signs in by magic link) and a new
 * carrier company. A known email must be signed in (401 `sign_in_required` otherwise), and the
 * request attaches to that user's carrier org. With `auto_approve` the link is active at once;
 * with `approval_required` the registration waits for the tenant. Single use, 24 hours.
 */
export async function verifyRegistration(
  tx: Tx,
  input: { token: string; signedIn: UserId | null },
  clock: Clock,
): Promise<RegistrationVerified & { userId: UserId }> {
  const now = clock.now();
  const [reg] = await tx.select().from(carrierRegistration).where(pendingWhere(input.token, now));
  if (!reg) throw new ApiError('unauthorized', 'Invalid or expired link');

  const userId = await redeemingUser(tx, {
    email: reg.email,
    signedIn: input.signedIn,
    now,
    newAccount: () => ({ name: reg.contactName, password: null, locale: reg.locale }),
  });
  const carrierId = await carrierOfUser(tx, userId, {
    name: reg.companyName,
    country: reg.country,
  });
  const link = { tenantId: reg.tenantId, siteId: reg.siteId };
  const mode = await asScope(tx, publicScope(link), async (inner) => {
    const access = await loadAccess(inner, publicScope(link), clock);
    return (await access.setting('booking.public_registration_mode', reg.siteId)).value;
  });
  const status = mode === 'auto_approve' ? 'approved' : 'pending_approval';

  const [claimed] = await tx
    .update(carrierRegistration)
    .set({
      status,
      emailVerifiedAt: now,
      userId,
      carrierId,
      decidedAt: status === 'approved' ? now : null,
    })
    .where(pendingWhere(input.token, now))
    .returning({ id: carrierRegistration.id });
  if (!claimed) throw new ApiError('unauthorized', 'Invalid or expired link');

  if (status === 'approved') {
    await linkAsTenant(tx, 'registration', {
      tenantId: reg.tenantId,
      carrierId,
      source: 'public_link',
      reactivateDeactivatedBefore: null,
    });
  }
  return { userId, carrierId, status };
}
