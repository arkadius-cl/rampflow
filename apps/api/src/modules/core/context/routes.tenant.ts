import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/t/:orgId/context` by modules/index.ts. U2 adds its routes. */
export const tenant = new Hono<AppEnv>();
