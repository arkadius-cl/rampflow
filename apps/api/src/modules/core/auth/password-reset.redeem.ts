import { eq, sql } from 'drizzle-orm';
import type { UserId } from '../../../db/ids.ts';
import { asScope, type Tx } from '../../../db/scope.ts';
import { appUser } from '../schema.ts';
import { revokeSessions } from './sessions.ts';
import { claimAuthToken } from './tokens.ts';

/**
 * Claims a reset token, sets the new password hash and deletes every session of the user, in
 * the caller's transaction. A reset proves the mailbox, so it also verifies the email.
 * Returns `null` for an unknown, used or expired token.
 */
export async function redeemPasswordReset(
  tx: Tx,
  token: string,
  passwordHash: string,
  now: Date,
): Promise<UserId | null> {
  const userId = await claimAuthToken(tx, 'password_reset', token, now);
  if (!userId) return null;
  await asScope(tx, { party: 'user', userId }, (inner) =>
    inner
      .update(appUser)
      .set({ passwordHash, emailVerifiedAt: sql`coalesce(${appUser.emailVerifiedAt}, ${now})` })
      .where(eq(appUser.id, userId)),
  );
  await revokeSessions(tx, userId);
  return userId;
}
