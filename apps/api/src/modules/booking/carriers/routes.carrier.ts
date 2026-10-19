import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/c/:orgId/tenants` by modules/index.ts. U7 adds its routes. */
export const carrier = new Hono<AppEnv>();
