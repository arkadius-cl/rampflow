import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/t/:orgId/safety` by modules/index.ts. U5 adds its routes. */
export const tenant = new Hono<AppEnv>();
