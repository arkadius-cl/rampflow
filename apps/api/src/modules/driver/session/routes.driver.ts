import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';
import { clearDriverCookie } from './cookie.ts';

/** Mounted at `/api/driver/session`: forgets this booking on this phone (DR-01). */
export const driver = new Hono<AppEnv>().delete('/', (c) => {
  clearDriverCookie(c);
  return c.body(null, 204);
});
