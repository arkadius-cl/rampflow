import { createHash } from 'node:crypto';
import { getConnInfo } from '@hono/node-server/conninfo';
import { and, asc, count, eq, gt, sql } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { db, type Tx } from '../db/pool.ts';
import { type RateLimitBucket, rateLimitEvent } from '../modules/core/schema.ts';
import type { AppEnv } from './env.ts';
import { env } from './env.ts';
import { ApiError } from './errors.ts';

/** ADR-0003, "Abuse limits". The retention job deletes events older than 24 hours. */
export const RATE_LIMITS = {
  login_failed: { limit: 5, windowSeconds: 15 * 60 },
  // Failed sign-ins per client address, whatever the email: each costs a scrypt hash.
  login_ip: { limit: 30, windowSeconds: 15 * 60 },
  magic_link_request: { limit: 5, windowSeconds: 60 * 60 },
  reset_request: { limit: 5, windowSeconds: 60 * 60 },
  driver_exchange: { limit: 10, windowSeconds: 60 },
  // Public-link registrations (CR-02): per email, and per client address against mass sign-ups.
  registration_request: { limit: 5, windowSeconds: 60 * 60 },
  registration_ip: { limit: 100, windowSeconds: 60 * 60 },
} as const satisfies Record<RateLimitBucket, { limit: number; windowSeconds: number }>;

export type RateLimitState = { limited: false } | { limited: true; retryAfterSeconds: number };

const keyHash = (key: string) => createHash('sha256').update(key).digest();

/** Locks the key until `tx` ends and says whether it is at the bucket's limit. Records nothing. */
export async function lockAndCount(
  tx: Tx,
  bucket: RateLimitBucket,
  hash: Buffer,
  now: Date,
): Promise<RateLimitState> {
  const { limit, windowSeconds } = RATE_LIMITS[bucket];
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`rate:${bucket}:${hash.toString('hex')}`}, 0))`,
  );
  const since = new Date(now.getTime() - windowSeconds * 1000);
  const inWindow = and(
    eq(rateLimitEvent.bucket, bucket),
    eq(rateLimitEvent.keyHash, hash),
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

// Every function commits on its own pool connection, never through c.var.db: the request
// transaction rolls back on 401 and 429, and the evidence of a failed attempt must survive it.
// `rate_limit_event` has no RLS, so no scope is needed.

/** Whether `key` is over the bucket's limit, without recording anything. */
export function rateLimitState(
  bucket: RateLimitBucket,
  key: string,
  now: Date,
): Promise<RateLimitState> {
  return db.transaction((tx) => lockAndCount(tx, bucket, keyHash(key), now));
}

/** Records one event, for example a failed sign-in. */
export async function recordRateLimitEvent(
  bucket: RateLimitBucket,
  key: string,
  now: Date,
): Promise<void> {
  await db.insert(rateLimitEvent).values({ bucket, keyHash: keyHash(key), at: now });
}

/** Records one event, or throws 429 `rate_limited` when the key is already at its limit. */
export async function consumeRateLimit(
  bucket: RateLimitBucket,
  key: string,
  now: Date,
): Promise<void> {
  const state = await db.transaction(async (tx) => {
    const hash = keyHash(key);
    const current = await lockAndCount(tx, bucket, hash, now);
    if (!current.limited)
      await tx.insert(rateLimitEvent).values({ bucket, keyHash: hash, at: now });
    return current;
  });
  if (state.limited) {
    throw new ApiError('rate_limited', 'Too many requests', {
      retryAfterSeconds: state.retryAfterSeconds,
    });
  }
}

/**
 * The client address. Behind a reverse proxy (`TRUST_PROXY=1`) it is the last
 * `X-Forwarded-For` entry, the one our proxy appended; otherwise the socket peer. Requests
 * without a socket (tests through `app.request`) read as `unknown`.
 */
export function clientIp(c: Context, trustProxy: boolean = env.TRUST_PROXY): string {
  if (trustProxy) {
    const forwarded = c.req.header('X-Forwarded-For')?.split(',').at(-1)?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Middleware form: one event per request, keyed by `keyOf(c)` (default: the client IP). */
export function rateLimit(
  bucket: RateLimitBucket,
  keyOf: (c: Context<AppEnv>) => string = (c) => clientIp(c),
): MiddlewareHandler<AppEnv> {
  return createMiddleware<AppEnv>(async (c, next) => {
    await consumeRateLimit(bucket, keyOf(c), c.var.clock.now());
    await next();
  });
}
