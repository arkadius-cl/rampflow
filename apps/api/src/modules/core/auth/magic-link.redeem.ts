import { ScopeParty } from '@rampflow/shared/values';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { hashToken } from '../../../db/ids.ts';
import { asScope, type Tx } from '../../../db/scope.ts';
import { appUser, authToken } from '../schema.ts';

/**
 * The email of the account a magic link signs in to, without claiming it, or `null` for an
 * unknown, used or expired link. The page shows it and signs in only after the holder confirms,
 * so a link of someone else's account cannot sign a browser in silently (login CSRF).
 */
export async function inspectMagicLink(tx: Tx, token: string, now: Date): Promise<string | null> {
  const [row] = await tx
    .select({ userId: authToken.userId })
    .from(authToken)
    .where(
      and(
        eq(authToken.tokenHash, hashToken(token)),
        eq(authToken.kind, 'magic_link'),
        isNull(authToken.usedAt),
        gt(authToken.expiresAt, now),
      ),
    );
  if (!row) return null;
  const { userId } = row;
  const [user] = await asScope(tx, { party: ScopeParty.user, userId }, (inner) =>
    inner.select({ email: appUser.email }).from(appUser).where(eq(appUser.id, userId)),
  );
  return user?.email ?? null;
}
