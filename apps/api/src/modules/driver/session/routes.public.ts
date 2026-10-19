import { zValidator } from '@hono/zod-validator';
import { ExchangeBody } from '@rampflow/shared/modules/driver/api';
import { Hono } from 'hono';
import { withScope } from '../../../db/scope.ts';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { rateLimit } from '../../../kernel/rate-limit.ts';
import { tokenScope } from '../../../kernel/scopes.ts';
import { onInvalid } from '../../../kernel/validate.ts';
import { setDriverCookie } from './cookie.ts';
import { exchangeDriverToken } from './exchange.ts';

/**
 * Mounted at `/api/public/driver-session`. The PWA posts the token from `/d#<token>` and gets
 * `rf_driver` back (ADR-0008). Unknown, expired and revoked tokens answer the same 401.
 */
export const publicApi = new Hono<AppEnv>().post(
  '/',
  rateLimit('driver_exchange'),
  zValidator('json', ExchangeBody, onInvalid),
  async (c) => {
    const { token } = c.req.valid('json');
    const now = c.var.clock.now();
    const access = await withScope(tokenScope(token, null), (tx) =>
      exchangeDriverToken(tx, token, now),
    );
    if (!access) throw new ApiError('unauthorized');
    setDriverCookie(c, token, access.expiresAt, now);
    return c.body(null, 204);
  },
);
