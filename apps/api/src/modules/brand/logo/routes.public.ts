import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/public/logos` by modules/index.ts. U3 adds its routes. */
export const publicApi = new Hono<AppEnv>();
