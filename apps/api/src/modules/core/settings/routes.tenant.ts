import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/t/:orgId/settings` by modules/index.ts. U3 adds its routes. */
export const tenant = new Hono<AppEnv>();
