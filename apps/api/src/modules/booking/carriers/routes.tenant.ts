import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/t/:orgId/carriers` by modules/index.ts. U7 adds its routes. */
export const tenant = new Hono<AppEnv>();
