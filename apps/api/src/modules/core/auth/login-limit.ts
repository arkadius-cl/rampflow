import { createHash } from 'node:crypto';
import { RateLimitBucket } from '@rampflow/shared/modules/core/values';
import type { Tx } from '../../../db/scope.ts';
import { lockAndCount, type RateLimitState } from '../../../kernel/rate-limit.ts';
import { rateLimitEvent } from '../schema.ts';

// Two failure limits of a password sign-in: 5 in 15 minutes per email and address (CR-03), and
// 30 in 15 minutes per address, so a client rotating emails cannot keep scrypt busy. Both are
// kept on the sign-in transaction's own connection: the attempt locks its keys, counts, verifies
// and records a failure in one transaction that commits even when the answer is 401. Taking a
// second pool connection while holding the lock (as the kernel's helpers do) would let a burst
// of sign-ins starve the pool.

export interface LoginKeys {
  login_ip: Buffer;
  login_failed: Buffer;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();

export const loginKeys = (email: string, ip: string): LoginKeys => ({
  login_ip: sha256(ip),
  login_failed: sha256(`${email.toLowerCase()}\n${ip}`),
});

/**
 * Serializes attempts for both keys until `tx` ends, the address first so every attempt locks in
 * the same order, then says whether either key is over its limit.
 */
export async function lockLoginKeys(tx: Tx, keys: LoginKeys, now: Date): Promise<RateLimitState> {
  const byAddress = await lockAndCount(tx, RateLimitBucket.login_ip, keys.login_ip, now);
  const byAccount = await lockAndCount(tx, RateLimitBucket.login_failed, keys.login_failed, now);
  if (!byAddress.limited) return byAccount;
  if (!byAccount.limited) return byAddress;
  return {
    limited: true,
    retryAfterSeconds: Math.max(byAddress.retryAfterSeconds, byAccount.retryAfterSeconds),
  };
}

export async function recordLoginFailure(tx: Tx, keys: LoginKeys, now: Date): Promise<void> {
  await tx.insert(rateLimitEvent).values([
    { bucket: RateLimitBucket.login_ip, keyHash: keys.login_ip, at: now },
    { bucket: RateLimitBucket.login_failed, keyHash: keys.login_failed, at: now },
  ]);
}
