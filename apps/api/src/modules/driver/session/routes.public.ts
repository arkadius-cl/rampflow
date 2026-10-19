import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/public/driver-session` by modules/index.ts. U10 adds its routes. */
export const publicApi = new Hono<AppEnv>();
