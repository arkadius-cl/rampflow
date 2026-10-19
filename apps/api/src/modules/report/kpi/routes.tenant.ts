import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/t/:orgId/reports` by modules/index.ts. U11 adds its routes. */
export const tenant = new Hono<AppEnv>();
