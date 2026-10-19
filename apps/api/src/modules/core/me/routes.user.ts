import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/me` by modules/index.ts. U2 adds its routes. */
export const user = new Hono<AppEnv>();
