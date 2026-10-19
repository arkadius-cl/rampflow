import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/t/:orgId/sites` by modules/index.ts. U4 adds its routes. */
export const tenant = new Hono<AppEnv>();
