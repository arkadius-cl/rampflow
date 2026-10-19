import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/c/:orgId/users` by modules/index.ts. U3 adds its routes. */
export const carrier = new Hono<AppEnv>();
