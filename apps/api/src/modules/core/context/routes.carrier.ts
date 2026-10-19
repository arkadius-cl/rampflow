import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/c/:orgId/context` by modules/index.ts. U2 adds its routes. */
export const carrier = new Hono<AppEnv>();
