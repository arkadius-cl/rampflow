import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/c/:orgId/bookings` by modules/index.ts. U8 adds its routes. */
export const carrier = new Hono<AppEnv>();
