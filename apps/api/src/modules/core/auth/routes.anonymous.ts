import {
  EmailLinkBody,
  LoginBody,
  type MagicLinkInspect,
  ResetConfirmBody,
  TokenBody,
} from '@rampflow/shared/modules/core/api.auth';
import { AuthTokenKind, RateLimitBucket } from '@rampflow/shared/modules/core/values';
import {
  EmailTemplate,
  ErrorCode,
  ScopeParty,
  StoryId,
  ValidationTarget,
} from '@rampflow/shared/values';
import { Hono } from 'hono';
import { withScope } from '../../../db/scope.ts';
import { noBody, op } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { enqueueEmail } from '../../../kernel/outbox.ts';
import { clientIp, consumeRateLimit } from '../../../kernel/rate-limit.ts';
import { scoped } from '../../../kernel/scoped.ts';
import { anonymousScope, userScope } from '../../../kernel/scopes.ts';
import { validate } from '../../../kernel/validate.ts';
import { lockLoginKeys, loginKeys, recordLoginFailure } from './login-limit.ts';
import { accountByEmail } from './lookup.ts';
import { inspectMagicLink } from './magic-link.redeem.ts';
import { dummyHash, verifyPassword } from './password.ts';
import { redeemPasswordReset } from './password-reset.redeem.ts';
import { endSession, startSession } from './sessions.ts';
import { claimAuthToken, issueAuthToken } from './tokens.ts';

// Mounted at /api/auth (ADR-0003, CR-03). No route holds a pool connection while it waits for
// another: sign-in and link requests open their transaction themselves, after or around the
// rate-limit step, and the rest run in the usual anonymous or user request transaction.

const DEFAULT_EMAIL_LOCALE = 'de';

const LINK_EMAIL = {
  magic_link: {
    template: EmailTemplate.core_magic_link,
    bucket: RateLimitBucket.magic_link_request,
  },
  password_reset: {
    template: EmailTemplate.core_password_reset,
    bucket: RateLimitBucket.reset_request,
  },
} as const;

/** Whether one more link email to this address fits in 5 per hour; records it when it does. */
async function linkRequestAllowed(kind: AuthTokenKind, email: string, now: Date) {
  try {
    await consumeRateLimit(LINK_EMAIL[kind].bucket, email.toLowerCase(), now);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.code === ErrorCode.rate_limited) return false;
    throw e;
  }
}

/**
 * Sends a magic link or a reset link when the account may use it, and answers nothing about
 * the account: the route always says 202. Magic links go only to verified accounts, because
 * every way into an account (invitation, registration) verifies it; a reset proves the mailbox.
 */
async function sendLinkEmail(kind: AuthTokenKind, body: EmailLinkBody, now: Date): Promise<void> {
  if (!(await linkRequestAllowed(kind, body.email, now))) return;
  await withScope({ party: ScopeParty.anonymous }, async (tx) => {
    const account = await accountByEmail(tx, body.email);
    if (!account || account.disabledAt) return;
    if (kind === AuthTokenKind.magic_link && !account.emailVerifiedAt) return;
    const authTokenId = await issueAuthToken(tx, kind, account.id, now);
    await enqueueEmail(
      tx,
      {
        template: LINK_EMAIL[kind].template,
        to: body.email,
        locale: body.locale ?? DEFAULT_EMAIL_LOCALE,
        payload: { authTokenId },
        tenantId: null,
      },
      null,
    );
  });
}

export const anonymous = new Hono<AppEnv>()
  .post(
    '/login',
    op({
      id: 'core.auth.login',
      stories: [StoryId.CR_03],
      description:
        '`{ email, password }` → 200 `{ ok }`; sets `rf_session`. A wrong password, an unknown, unverified or disabled email all answer the same 401; 429 `rate_limited` after 5 failures in 15 minutes for the email and client address, or 30 for the client address alone',
      responses: {},
    }),
    validate(ValidationTarget.json, LoginBody),
    async (c) => {
      const { email, password } = c.req.valid('json');
      const now = c.var.clock.now();
      const keys = loginKeys(email, clientIp(c));
      // One transaction locks the key, counts, verifies and records a failure, and commits even
      // for a wrong password, so a burst for one key is serialized and every failure counts.
      const outcome = await withScope({ party: ScopeParty.anonymous }, async (tx) => {
        const limit = await lockLoginKeys(tx, keys, now);
        if (limit.limited) return limit;
        const account = await accountByEmail(tx, email);
        const matches = await verifyPassword(
          password,
          account?.passwordHash ?? (await dummyHash()),
        );
        if (!account || !matches || !account.emailVerifiedAt || account.disabledAt) {
          await recordLoginFailure(tx, keys, now);
          return { failed: true } as const;
        }
        await startSession(c, tx, account.id, now);
        return { signedIn: true } as const;
      });
      if ('limited' in outcome && outcome.limited) {
        throw new ApiError(ErrorCode.rate_limited, 'Too many failed sign-ins', {
          retryAfterSeconds: outcome.retryAfterSeconds,
        });
      }
      if ('failed' in outcome)
        throw new ApiError(ErrorCode.unauthorized, 'Wrong email or password');
      return c.json({ ok: true } as const, 200);
    },
  )
  .post(
    '/logout',
    op({
      id: 'core.auth.logout',
      stories: [StoryId.CR_03],
      description: '204; deletes the session and clears the cookie',
      responses: { 204: noBody },
    }),
    scoped(userScope),
    async (c) => {
      await endSession(c, c.var.db);
      return c.body(null, 204);
    },
  )
  .post(
    '/magic-link',
    op({
      id: 'core.auth.requestMagicLink',
      stories: [StoryId.CR_03],
      description:
        "`{ email, locale? }`; 202. Sends only to verified, enabled accounts, in `locale` (the page's language, default `de`); stops sending after 5 per hour per email",
      responses: { 202: noBody },
    }),
    validate(ValidationTarget.json, EmailLinkBody),
    async (c) => {
      await sendLinkEmail(AuthTokenKind.magic_link, c.req.valid('json'), c.var.clock.now());
      return c.body(null, 202);
    },
  )
  .post(
    '/magic-link/inspect',
    op({
      id: 'core.auth.inspectMagicLink',
      stories: [StoryId.CR_03],
      description:
        '`{ token }` → 200 `{ email }` of the account the link signs in to, without using the link; 401 for an unknown, used or expired link. `/auth/magic` shows it and exchanges only after the holder clicks "Continue as" (login CSRF)',
      responses: {},
    }),
    scoped(anonymousScope),
    validate(ValidationTarget.json, TokenBody),
    async (c) => {
      const email = await inspectMagicLink(c.var.db, c.req.valid('json').token, c.var.clock.now());
      if (!email) throw new ApiError(ErrorCode.unauthorized, 'Invalid or expired link');
      return c.json({ email } satisfies MagicLinkInspect, 200);
    },
  )
  .post(
    '/magic-link/exchange',
    op({
      id: 'core.auth.exchangeMagicLink',
      stories: [StoryId.CR_03],
      description: '`{ token }` → 200 `{ ok }`; sets `rf_session`; single use, 15 minutes',
      responses: {},
    }),
    scoped(anonymousScope),
    validate(ValidationTarget.json, TokenBody),
    async (c) => {
      const now = c.var.clock.now();
      const userId = await claimAuthToken(
        c.var.db,
        AuthTokenKind.magic_link,
        c.req.valid('json').token,
        now,
      );
      if (!userId) throw new ApiError(ErrorCode.unauthorized, 'Invalid or expired link');
      await startSession(c, c.var.db, userId, now);
      return c.json({ ok: true } as const, 200);
    },
  )
  .post(
    '/password-reset',
    op({
      id: 'core.auth.requestPasswordReset',
      stories: [StoryId.CR_03],
      description:
        '`{ email, locale? }`; 202, as for the magic link (unverified accounts included)',
      responses: { 202: noBody },
    }),
    validate(ValidationTarget.json, EmailLinkBody),
    async (c) => {
      await sendLinkEmail(AuthTokenKind.password_reset, c.req.valid('json'), c.var.clock.now());
      return c.body(null, 202);
    },
  )
  .post(
    '/password-reset/confirm',
    op({
      id: 'core.auth.confirmPasswordReset',
      stories: [StoryId.CR_03],
      description:
        '`{ token, password }` → 200 `{ ok }`; sets the password, verifies the email, deletes every session of the user and signs this browser in; single use, 60 minutes',
      responses: {},
    }),
    scoped(anonymousScope),
    validate(ValidationTarget.json, ResetConfirmBody),
    async (c) => {
      const { token, password } = c.req.valid('json');
      const now = c.var.clock.now();
      const userId = await redeemPasswordReset(c.var.db, token, password, now);
      if (!userId) throw new ApiError(ErrorCode.unauthorized, 'Invalid or expired link');
      await startSession(c, c.var.db, userId, now);
      return c.json({ ok: true } as const, 200);
    },
  );
