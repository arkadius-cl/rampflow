import { zValidator } from '@hono/zod-validator';
import {
  EmailLinkBody,
  LoginBody,
  ResetConfirmBody,
  TokenBody,
} from '@rampflow/shared/modules/core/api.auth';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { UserId } from '../../../db/ids.ts';
import type { Tx } from '../../../db/scope.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { enqueueEmail } from '../../../kernel/outbox.ts';
import {
  clientIp,
  consumeRateLimit,
  rateLimitState,
  recordRateLimitEvent,
} from '../../../kernel/rate-limit.ts';
import { scoped } from '../../../kernel/scoped.ts';
import { anonymousScope, userScope } from '../../../kernel/scopes.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { accountByEmail } from './lookup.ts';
import { dummyHash, hashPassword, verifyPassword } from './password.ts';
import { redeemPasswordReset } from './password-reset.redeem.ts';
import { endSession, startSession } from './sessions.ts';
import { type AuthTokenKind, claimAuthToken, issueAuthToken } from './tokens.ts';

// Mounted at /api/auth (ADR-0003, CR-03). Every route opens its own request transaction:
// anonymous before a session exists, user for sign-out.

const DEFAULT_EMAIL_LOCALE = 'de';

const LINK_EMAIL = {
  magic_link: { template: 'core.magic-link', bucket: 'magic_link_request' },
  password_reset: { template: 'core.password-reset', bucket: 'reset_request' },
} as const;

/**
 * Sends a magic link or a reset link when the account may use it. Answers nothing about the
 * account: the route always says 202. After 5 requests per hour for one email it stops sending.
 */
async function sendLinkEmail(
  tx: Tx,
  kind: AuthTokenKind,
  body: EmailLinkBody,
  userId: UserId,
  now: Date,
): Promise<void> {
  const { template, bucket } = LINK_EMAIL[kind];
  try {
    await consumeRateLimit(bucket, body.email.toLowerCase(), now);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'rate_limited') return;
    throw e;
  }
  const authTokenId = await issueAuthToken(tx, kind, userId, now);
  await enqueueEmail(
    tx,
    {
      template,
      to: body.email,
      locale: body.locale ?? DEFAULT_EMAIL_LOCALE,
      payload: { authTokenId },
      tenantId: null,
    },
    null,
  );
}

export const anonymous = new Hono<AppEnv>()
  .post('/login', scoped(anonymousScope), zValidator('json', LoginBody, onInvalid), async (c) => {
    const { email, password } = c.req.valid('json');
    const tx = c.var.db;
    const now = c.var.clock.now();
    const key = `${email.toLowerCase()}\n${clientIp(c)}`;
    // Serializes attempts for one email and address, so a burst cannot all pass the check below
    // before the first failure is recorded. Held until the request transaction ends.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`login:${key}`}, 0))`);
    const limit = await rateLimitState('login_failed', key, now);
    if (limit.limited) {
      throw new ApiError('rate_limited', 'Too many failed sign-ins', {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }
    const account = await accountByEmail(tx, email);
    const matches = await verifyPassword(password, account?.passwordHash ?? (await dummyHash()));
    if (!account || !matches || !account.emailVerifiedAt || account.disabledAt) {
      await recordRateLimitEvent('login_failed', key, now);
      throw new ApiError('unauthorized', 'Wrong email or password');
    }
    await startSession(c, tx, account.id, now);
    return c.json({ ok: true } as const, 200);
  })
  .post('/logout', scoped(userScope), async (c) => {
    await endSession(c, c.var.db);
    return c.body(null, 204);
  })
  .post(
    '/magic-link',
    scoped(anonymousScope),
    zValidator('json', EmailLinkBody, onInvalid),
    async (c) => {
      const body = c.req.valid('json');
      const account = await accountByEmail(c.var.db, body.email);
      // Only verified accounts: every way into an account (invitation, registration) verifies it.
      if (account?.emailVerifiedAt && !account.disabledAt) {
        await sendLinkEmail(c.var.db, 'magic_link', body, account.id, c.var.clock.now());
      }
      return c.body(null, 202);
    },
  )
  .post(
    '/magic-link/exchange',
    scoped(anonymousScope),
    zValidator('json', TokenBody, onInvalid),
    async (c) => {
      const now = c.var.clock.now();
      const userId = await claimAuthToken(c.var.db, 'magic_link', c.req.valid('json').token, now);
      if (!userId) throw new ApiError('unauthorized', 'Invalid or expired link');
      await startSession(c, c.var.db, userId, now);
      return c.json({ ok: true } as const, 200);
    },
  )
  .post(
    '/password-reset',
    scoped(anonymousScope),
    zValidator('json', EmailLinkBody, onInvalid),
    async (c) => {
      const body = c.req.valid('json');
      const account = await accountByEmail(c.var.db, body.email);
      if (account && !account.disabledAt) {
        await sendLinkEmail(c.var.db, 'password_reset', body, account.id, c.var.clock.now());
      }
      return c.body(null, 202);
    },
  )
  .post(
    '/password-reset/confirm',
    scoped(anonymousScope),
    zValidator('json', ResetConfirmBody, onInvalid),
    async (c) => {
      const { token, password } = c.req.valid('json');
      const now = c.var.clock.now();
      const passwordHash = await hashPassword(password);
      const userId = await redeemPasswordReset(c.var.db, token, passwordHash, now);
      if (!userId) throw new ApiError('unauthorized', 'Invalid or expired link');
      await startSession(c, c.var.db, userId, now);
      return c.json({ ok: true } as const, 200);
    },
  );
