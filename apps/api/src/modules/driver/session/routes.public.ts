import { RateLimitBucket } from '@rampflow/shared/modules/core/values';
import { ExchangeBody } from '@rampflow/shared/modules/driver/api';
import { ErrorCode, StoryId } from '@rampflow/shared/values';
import { Hono } from 'hono';
import { withScope } from '../../../db/scope.ts';
import { noBody, op } from '../../../kernel/describe.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { rateLimit } from '../../../kernel/rate-limit.ts';
import { tokenScope } from '../../../kernel/scopes.ts';
import { validate } from '../../../kernel/validate.ts';
import { setDriverCookie } from './cookie.ts';
import { exchangeDriverToken } from './exchange.ts';

/**
 * Mounted at `/api/public/driver-session`. The PWA posts the token from `/d#<token>` and gets
 * `rf_driver` back (ADR-0008). Unknown, expired and revoked tokens answer the same 401.
 */
export const publicApi = new Hono<AppEnv>().post(
  '/',
  op({
    id: 'driver.session.createSession',
    stories: [StoryId.DR_01],
    description:
      "`{ token }`; 204 and `rf_driver=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/driver; Max-Age=<seconds to the link's expiry>`; unknown, expired and revoked tokens answer the same 401 `unauthorized`; every call counts against `driver_exchange` (10 per minute per IP, 429 `rate_limited`); sets `driver_access.last_used_at`",
    responses: { 204: noBody },
  }),
  rateLimit(RateLimitBucket.driver_exchange),
  validate('json', ExchangeBody),
  async (c) => {
    const { token } = c.req.valid('json');
    const now = c.var.clock.now();
    const access = await withScope(tokenScope(token, null), (tx) =>
      exchangeDriverToken(tx, token, now),
    );
    if (!access) throw new ApiError(ErrorCode.unauthorized);
    setDriverCookie(c, token, access.expiresAt, now);
    return c.body(null, 204);
  },
);
