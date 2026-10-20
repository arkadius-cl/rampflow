import { createHmac } from 'node:crypto';
import type { SignupChallenge } from '@rampflow/shared/modules/core/api.signup';
import { RateLimitBucket } from '@rampflow/shared/modules/core/values';
import { ErrorCode } from '@rampflow/shared/values';
import { createChallenge, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import * as z from 'zod';
import { env } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { consumeRateLimit } from '../../../kernel/rate-limit.ts';

// ALTCHA proof of work for self-registration (design decision 6), verified by this API only.

const ALGORITHM = 'PBKDF2/SHA-256';
/** PBKDF2 iterations per attempt; about 256 attempts take a mid-range phone a second. */
const COST = 5_000;
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** `HMAC(TOKEN_SECRET, "altcha")`: no secret of its own, and dev differs from production. */
const hmacKey = (secret = env.TOKEN_SECRET) =>
  createHmac('sha256', secret).update('altcha').digest('hex');

/**
 * The expiry sits in the signed `data`, not in `parameters.expiresAt`: altcha-lib checks that
 * one against the wall clock, and the API reads time from the injected clock.
 */
export function createSignupChallenge(now: Date): Promise<SignupChallenge> {
  return createChallenge({
    algorithm: ALGORITHM,
    cost: COST,
    deriveKey,
    data: { expiresAt: Math.floor((now.getTime() + CHALLENGE_TTL_MS) / 1000) },
    hmacSignatureSecret: hmacKey(),
  });
}

const Payload = z.object({
  // Loose: the signature covers every parameter, so none may be dropped.
  challenge: z.object({
    parameters: z.looseObject({
      algorithm: z.string(),
      nonce: z.string(),
      salt: z.string(),
      cost: z.number(),
      keyLength: z.number(),
      keyPrefix: z.string(),
      data: z
        .object({ expiresAt: z.number() })
        .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    }),
    signature: z.string(),
  }),
  solution: z.object({ counter: z.number(), derivedKey: z.string() }),
});

function parsePayload(payload: string) {
  try {
    return Payload.safeParse(JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))).data;
  } catch {
    return undefined;
  }
}

/**
 * Whether `payload` (the widget's base64 JSON) solves a challenge of ours that is under 10
 * minutes old and was not used before. A verified solution is recorded at once, so a second use
 * answers false; the record expires with the challenge.
 */
export async function verifySignupSolution(payload: string, now: Date): Promise<boolean> {
  const parsed = parsePayload(payload);
  if (!parsed) return false;
  const { challenge, solution } = parsed;
  if (challenge.parameters.data.expiresAt * 1000 <= now.getTime()) return false;
  const result = await verifySolution({
    challenge,
    solution,
    deriveKey,
    hmacSignatureSecret: hmacKey(),
  });
  if (!result.verified) return false;
  try {
    await consumeRateLimit(RateLimitBucket.altcha_solution, challenge.signature, now);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.code === ErrorCode.rate_limited) return false;
    throw e;
  }
}
