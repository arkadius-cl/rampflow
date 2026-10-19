import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/platform` by modules/index.ts. U3 adds its routes. */
export const platform = new Hono<AppEnv>();
