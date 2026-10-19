import { eq, sql } from 'drizzle-orm';
import type { UserId } from '../../../db/ids.ts';
import { asScope, type Tx } from '../../../db/scope.ts';
import { appUser } from '../schema.ts';
import { hashPassword } from './password.ts';
import { revokeSessions } from './sessions.ts';
import { claimAuthToken, revokeAuthTokens } from './tokens.ts';

/**
 * Claims a reset token, then hashes and sets the new password, voids every other reset and magic link
 * of the user and deletes every session, in the caller's transaction. A reset proves the mailbox, so it also verifies the email.
 * Returns `null` for an unknown, used or expired token, before spending any scrypt work.
 */
export async function redeemPasswordReset(
  tx: Tx,
  token: string,
  password: string,
  now: Date,
): Promise<UserId | null> {
  const userId = await claimAuthToken(tx, 'password_reset', token, now);
  if (!userId) return null;
  const passwordHash = await hashPassword(password);
  await asScope(tx, { party: 'user', userId }, (inner) =>
    inner
      .update(appUser)
      .set({ passwordHash, emailVerifiedAt: sql`coalesce(${appUser.emailVerifiedAt}, ${now})` })
      .where(eq(appUser.id, userId)),
  );
  await revokeAuthTokens(tx, userId, now);
  await revokeSessions(tx, userId);
  return userId;
}
