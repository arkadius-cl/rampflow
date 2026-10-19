import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/t/:orgId/bookings` by modules/index.ts. U6 adds its routes. */
export const tenant = new Hono<AppEnv>();
