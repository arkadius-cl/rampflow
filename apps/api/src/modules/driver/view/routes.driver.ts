import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../../../kernel/env.ts';
import { ApiError } from '../../../kernel/errors.ts';
import { DRIVER_COOKIE } from '../../../kernel/scopes.ts';
import { loadDriverView } from './view.ts';

/** Mounted at `/api/driver`. The PWA polls `/booking` every 15 s while visible (DR-03). */
export const driver = new Hono<AppEnv>().get('/booking', async (c) => {
  const { scope, db, access } = c.var;
  const token = getCookie(c, DRIVER_COOKIE);
  if (scope.party !== 'driver' || !token) throw new ApiError('unauthorized');
  const view = await loadDriverView({
    tx: db,
    access,
    tenantId: scope.tenantId,
    bookingId: scope.bookingId,
    channel: scope.channel,
    token,
    now: c.var.clock.now(),
  });
  return c.json(view, 200);
});
