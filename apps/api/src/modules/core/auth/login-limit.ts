import { createHash } from 'node:crypto';
import { and, asc, count, eq, gt, sql } from 'drizzle-orm';
import type { Tx } from '../../../db/scope.ts';
import { RATE_LIMITS, type RateLimitState } from '../../../kernel/rate-limit.ts';
import { rateLimitEvent } from '../schema.ts';

// The 5-in-15-minutes rule of CR-03, kept on the sign-in transaction's own connection: the
// attempt locks its email-and-address key, counts, verifies and records a failure in one
// transaction that commits even when the answer is 401. Taking a second pool connection while
// holding the lock (as the kernel's helpers do) would let a burst of sign-ins starve the pool.

const { limit, windowSeconds } = RATE_LIMITS.login_failed;

export const loginKey = (email: string, ip: string) =>
  createHash('sha256').update(`${email.toLowerCase()}\n${ip}`).digest();

/** Serializes attempts for the key until `tx` ends, then says whether the key is over its limit. */
export async function lockLoginKey(tx: Tx, key: Buffer, now: Date): Promise<RateLimitState> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`rate:login_failed:${key.toString('hex')}`}, 0))`,
  );
  const since = new Date(now.getTime() - windowSeconds * 1000);
  const inWindow = and(
    eq(rateLimitEvent.bucket, 'login_failed'),
    eq(rateLimitEvent.keyHash, key),
    gt(rateLimitEvent.at, since),
  );
  const [row] = await tx.select({ n: count() }).from(rateLimitEvent).where(inWindow);
  if ((row?.n ?? 0) < limit) return { limited: false };
  const [oldest] = await tx
    .select({ at: rateLimitEvent.at })
    .from(rateLimitEvent)
    .where(inWindow)
    .orderBy(asc(rateLimitEvent.at))
    .limit(1);
  const freeAt = (oldest?.at.getTime() ?? now.getTime()) + windowSeconds * 1000;
  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((freeAt - now.getTime()) / 1000)),
  };
}

export async function recordLoginFailure(tx: Tx, key: Buffer, now: Date): Promise<void> {
  await tx.insert(rateLimitEvent).values({ bucket: 'login_failed', keyHash: key, at: now });
}
