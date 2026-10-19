import { Hono } from 'hono';
import type { AppEnv } from '../../kernel/env.ts';

/** Mounted at `/api/t/:orgId/yard` by modules/index.ts. U9 adds its routes. */
export const tenant = new Hono<AppEnv>();
