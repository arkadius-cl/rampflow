import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { hashToken, type Id, type UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { tokenHashFor } from '../../../kernel/tokens.ts';
import { authToken } from '../schema.ts';

// Magic links and password resets (ADR-0003, "Tokens"). The token derives from the row id, so the
// outbox payload carries only the id and no table holds a usable token. `auth_token` has no RLS.

export type AuthTokenKind = 'magic_link' | 'password_reset';

export const AUTH_TOKEN_TTL_MS: Record<AuthTokenKind, number> = {
  magic_link: 15 * 60_000,
  password_reset: 60 * 60_000,
};

/** Stores a new token for `userId` and returns its row id, which the email template turns into the link. */
export async function issueAuthToken(
  tx: Tx,
  kind: AuthTokenKind,
  userId: UserId,
  now: Date,
): Promise<string> {
  const id = randomUUID() as Id<'auth_token'>;
  await tx.insert(authToken).values({
    id,
    kind,
    userId,
    tokenHash: tokenHashFor(kind, id),
    expiresAt: new Date(now.getTime() + AUTH_TOKEN_TTL_MS[kind]),
  });
  return id;
}

/**
 * Marks the token used and returns its user, or `null` when it is unknown, used, expired or of
 * another kind. One guarded statement, so of two concurrent exchanges exactly one wins.
 */
export async function claimAuthToken(
  tx: Tx,
  kind: AuthTokenKind,
  token: string,
  now: Date,
): Promise<UserId | null> {
  const [row] = await tx
    .update(authToken)
    .set({ usedAt: now })
    .where(
      and(
        eq(authToken.tokenHash, hashToken(token)),
        eq(authToken.kind, kind),
        isNull(authToken.usedAt),
        gt(authToken.expiresAt, now),
      ),
    )
    .returning({ userId: authToken.userId });
  return row?.userId ?? null;
}
