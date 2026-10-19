import { Hono } from 'hono';
import type { AppEnv } from '../../../kernel/env.ts';

/** Mounted at `/api/platform/context` by modules/index.ts. U2 adds its routes. */
export const platform = new Hono<AppEnv>();
