import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { hashToken, type TokenHash, type UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import { env } from '../../../kernel/env.ts';
import { SESSION_ABSOLUTE_MS, SESSION_COOKIE } from '../../../kernel/scopes.ts';
import { session } from '../schema.ts';

// ADR-0003, "Sessions". The cookie holds 32 random bytes; the table holds only their SHA-256.
// `session` has no RLS, so these work under any scope of the request transaction.

const cookieOptions = () =>
  ({
    httpOnly: true,
    // Secure everywhere but development, which also covers an unset NODE_ENV (env.ts).
    secure: env.NODE_ENV !== 'development',
    sameSite: 'Lax',
    path: '/',
  }) as const;

/** Creates a session for `userId` in `tx` and sets `rf_session`. Returns the new session's id. */
export async function startSession(c: Context, tx: Tx, userId: UserId, now: Date) {
  // The browser's previous session would stay valid with no cookie left to sign it out.
  const previous = currentSessionId(c);
  if (previous) await tx.delete(session).where(eq(session.id, previous));
  const token = randomBytes(32).toString('base64url');
  const id = hashToken(token);
  await tx.insert(session).values({
    id,
    userId,
    expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
    lastSeenAt: now,
    userAgent: c.req.header('User-Agent')?.slice(0, 200) ?? null,
  });
  setCookie(c, SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: SESSION_ABSOLUTE_MS / 1000,
  });
  return id;
}

/** The id of the request's session, if it sent one. */
export function currentSessionId(c: Context): TokenHash | null {
  const token = getCookie(c, SESSION_COOKIE);
  return token ? hashToken(token) : null;
}

export async function endSession(c: Context, tx: Tx): Promise<void> {
  const id = currentSessionId(c);
  if (id) await tx.delete(session).where(eq(session.id, id));
  deleteCookie(c, SESSION_COOKIE, cookieOptions());
}

/** Deletes every session of the user. A password reset then signs the resetting browser in again. */
export async function revokeSessions(tx: Tx, userId: UserId): Promise<void> {
  await tx.delete(session).where(eq(session.userId, userId));
}
